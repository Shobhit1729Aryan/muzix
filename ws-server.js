require('dotenv').config();
const WebSocket = require('ws');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PORT = process.env.PORT || process.env.WS_PORT || 3001;
const WS_TOKEN_SECRET = process.env.WS_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'dev_secret';
const roomPlaybackState = new Map();

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});

wss.on('error', (error) => {
  console.error('WebSocket server error', error);
});

function broadcastToRoom(roomId, payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.roomId === roomId) {
      client.send(msg);
    }
  });
}

function verifyToken(token) {
  try {
    const payload = Buffer.from(token, 'base64').toString('utf8');
    const [userId, ts, sig] = payload.split(':')
    const mac = crypto.createHmac('sha256', WS_TOKEN_SECRET).update(`${userId}:${ts}`).digest('hex')
    if (mac !== sig) return null
    const age = Date.now() - parseInt(ts, 10)
    if (isNaN(age) || age > 1000 * 60 * 60) return null // 1 hour
    return userId
  } catch (e) {
    return null
  }
}

async function getQueue(roomId) {
  return prisma.roomSong.findMany({
    where: { roomId },
    orderBy: [
      { votes: 'desc' },
      { createdAt: 'asc' },
    ],
  });
}

function broadcastToRoomExcept(roomId, excludedWs, payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (
      client !== excludedWs &&
      client.readyState === WebSocket.OPEN &&
      client.roomId === roomId
    ) {
      client.send(msg);
    }
  });
}

function getSenderLabel(email) {
  if (!email) return 'Guest';
  return email.split('@')[0];
}

function normalizeDisplayName(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback || 'Guest';
}

function getCurrentSongId(roomId) {
  return roomPlaybackState.get(roomId)?.currentSongId ?? null;
}

function getPlaybackState(roomId) {
  return roomPlaybackState.get(roomId) ?? {
    currentSongId: null,
    isPlaying: true,
    positionSeconds: 0,
    updatedAt: Date.now(),
  };
}

function setPlaybackState(roomId, nextState) {
  const currentState = getPlaybackState(roomId);
  roomPlaybackState.set(roomId, {
    ...currentState,
    ...nextState,
    updatedAt: Date.now(),
  });
}

function setCurrentSongId(roomId, currentSongId) {
  setPlaybackState(roomId, { currentSongId, positionSeconds: 0 });
}

function ensureCurrentSong(roomId, queue) {
  const existingSongId = getCurrentSongId(roomId);
  if (existingSongId && queue.some((song) => song.id === existingSongId)) {
    return existingSongId;
  }

  const nextSongId = queue[0]?.id ?? null;
  setPlaybackState(roomId, {
    currentSongId: nextSongId,
    positionSeconds: 0,
    isPlaying: nextSongId ? true : false,
  });
  return nextSongId;
}

async function isHost(roomId, userId) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { hostId: true },
  });

  return room?.hostId === userId;
}

async function sendRoomSnapshot(roomId, targetWs) {
  const queue = await getQueue(roomId);
  const currentSongId = ensureCurrentSong(roomId, queue);
  const playbackState = getPlaybackState(roomId);
  const payload = {
    type: 'init',
    queue,
    currentSongId,
    playbackState: {
      currentSongId: playbackState.currentSongId,
      isPlaying: playbackState.isPlaying,
      positionSeconds: playbackState.positionSeconds,
      updatedAt: playbackState.updatedAt,
    },
  };

  if (targetWs) {
    targetWs.send(JSON.stringify(payload));
    return;
  }

  broadcastToRoom(roomId, payload);
}

async function sendChatHistory(roomId, targetWs) {
  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  targetWs.send(JSON.stringify({
    type: 'chatHistory',
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderLabel: message.senderLabel,
      ciphertext: message.ciphertext,
      iv: message.iv,
      createdAt: message.createdAt,
    })),
  }));
}

wss.on('connection', (ws) => {
  ws.isAuthed = false

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    const { type } = data;

    if (type === 'auth') {
      const { token, displayName } = data;
      const wasAuthed = ws.isAuthed === true;
      const uid = verifyToken(token);
      if (!uid) {
        ws.send(JSON.stringify({ type: 'error', message: 'auth_failed' }));
        return;
      }
      ws.userId = uid;
      ws.isAuthed = true;
      const user = await prisma.user.findUnique({
        where: { id: uid },
        select: { email: true },
      });
      ws.senderLabel = normalizeDisplayName(displayName, getSenderLabel(user?.email));
      if (ws.roomId && !wasAuthed) {
        await sendChatHistory(ws.roomId, ws);
        broadcastToRoomExcept(ws.roomId, ws, {
          type: 'presence',
          event: 'joined',
          senderId: ws.userId,
          senderLabel: ws.senderLabel,
          createdAt: new Date().toISOString(),
        });
      }
      return;
    }

      if (type === 'join') {
        const { roomId } = data;
        ws.roomId = roomId;
        // load queue from db
        try {
          await sendRoomSnapshot(roomId, ws);
          if (ws.isAuthed) {
            await sendChatHistory(roomId, ws);
          }
        } catch (e) {
          console.error('DB error join', e)
          ws.send(JSON.stringify({ type: 'error', message: 'join_failed' }));
        }
        return;
      }

    if (type === 'add') {
      const { roomId, song } = data;
      try {
        await prisma.roomSong.upsert({
          where: { id: song.id },
          update: { title: song.title, thumbnail: song.thumbnail, url: song.url, roomId },
          create: { id: song.id, title: song.title, thumbnail: song.thumbnail, url: song.url, roomId }
        })
        await sendRoomSnapshot(roomId);
        broadcastToRoom(roomId, {
          type: 'songAdded',
          senderId: ws.userId,
          senderLabel: ws.senderLabel || song.addedByLabel || 'Guest',
          songTitle: song.title,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('DB error add', e)
        ws.send(JSON.stringify({ type: 'error', message: 'add_failed' }));
      }
      return;
    }

    if (type === 'vote') {
      // require auth
      if (!ws.isAuthed) {
        ws.send(JSON.stringify({ type: 'error', message: 'not_authenticated' }))
        return
      }
      const { roomId, songId, vote } = data; // vote: -1|1
      const userId = ws.userId
      try {
        // find existing vote
        const existing = await prisma.roomSongVote.findUnique({ where: { userId_songId: { userId, songId } } }).catch(()=>null)
        if (existing && existing.vote === vote) {
          ws.send(JSON.stringify({ type: 'voteIgnored', songId, vote }));
          return;
        }

        // transactionally update/create/delete and adjust RoomSong.votes
        await prisma.$transaction(async (tx) => {
          const song = await tx.roomSong.findUnique({ where: { id: songId } })
          if (!song) return
          const currentVote = existing ? existing.vote : 0
          const normalizedVote = currentVote === 1 && vote === -1
            ? 0
            : currentVote === -1 && vote === 1
              ? 0
              : vote
          const delta = normalizedVote - currentVote

          if (existing) {
            if (normalizedVote === 0) {
              await tx.roomSongVote.delete({ where: { userId_songId: { userId, songId } } })
            } else {
              await tx.roomSongVote.update({ where: { userId_songId: { userId, songId } }, data: { vote: normalizedVote } })
            }
          } else if (normalizedVote !== 0) {
            await tx.roomSongVote.create({ data: { userId, songId, vote: normalizedVote } })
          }

          await tx.roomSong.update({ where: { id: songId }, data: { votes: { increment: delta } } })
        })

        await sendRoomSnapshot(roomId);
      } catch (e) {
        console.error('DB error vote', e)
        ws.send(JSON.stringify({ type: 'error', message: 'vote_failed' }));
      }
      return;
    }

    if (type === 'chatMessage') {
      if (!ws.isAuthed) {
        ws.send(JSON.stringify({ type: 'error', message: 'not_authenticated' }));
        return;
      }

      const { roomId, ciphertext, iv } = data;
      if (!roomId || !ciphertext || !iv) {
        ws.send(JSON.stringify({ type: 'error', message: 'chat_invalid' }));
        return;
      }

      try {
        const savedMessage = await prisma.chatMessage.create({
          data: {
            roomId,
            senderId: ws.userId,
            senderLabel: ws.senderLabel || 'Guest',
            ciphertext,
            iv,
          },
        });

        broadcastToRoom(roomId, {
          type: 'chatMessage',
          message: {
            id: savedMessage.id,
            senderId: savedMessage.senderId,
            senderLabel: savedMessage.senderLabel,
            ciphertext: savedMessage.ciphertext,
            iv: savedMessage.iv,
            createdAt: savedMessage.createdAt,
          },
        });
      } catch (e) {
        console.error('DB error chatMessage', e);
        ws.send(JSON.stringify({ type: 'error', message: 'chat_send_failed' }));
      }
      return;
    }

    if (type === 'songEnded') {
      const { roomId, songId } = data;
      const currentSongId = getCurrentSongId(roomId);
      if (!currentSongId || currentSongId !== songId) {
        return;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.roomSongVote.deleteMany({ where: { songId } });
          await tx.roomSong.delete({ where: { id: songId } });
        });

        setCurrentSongId(roomId, null);
        await sendRoomSnapshot(roomId);
      } catch (e) {
        console.error('DB error songEnded', e);
        ws.send(JSON.stringify({ type: 'error', message: 'song_end_failed' }));
      }
      return;
    }

    if (type === 'playbackControl') {
      if (!ws.isAuthed) {
        ws.send(JSON.stringify({ type: 'error', message: 'not_authenticated' }));
        return;
      }

      const { roomId, action, positionSeconds } = data;
      const userId = ws.userId;

      try {
        const hostUser = await isHost(roomId, userId);
        if (!hostUser) {
          ws.send(JSON.stringify({ type: 'error', message: 'host_only_control' }));
          return;
        }

        const currentState = getPlaybackState(roomId);
        let nextState = { ...currentState };

        if (action === 'play') {
          nextState = {
            ...nextState,
            isPlaying: true,
            positionSeconds: typeof positionSeconds === 'number' ? positionSeconds : nextState.positionSeconds,
          };
        }

        if (action === 'pause') {
          nextState = {
            ...nextState,
            isPlaying: false,
            positionSeconds: typeof positionSeconds === 'number' ? positionSeconds : nextState.positionSeconds,
          };
        }

        if (action === 'seek') {
          nextState = {
            ...nextState,
            positionSeconds: Math.max(0, typeof positionSeconds === 'number' ? positionSeconds : nextState.positionSeconds),
          };
        }

        setPlaybackState(roomId, nextState);
        const playbackState = getPlaybackState(roomId);
        broadcastToRoom(roomId, {
          type: 'playbackSync',
          playbackState: {
            currentSongId: playbackState.currentSongId,
            isPlaying: playbackState.isPlaying,
            positionSeconds: playbackState.positionSeconds,
            updatedAt: playbackState.updatedAt,
          },
        });
      } catch (e) {
        console.error('DB error playbackControl', e);
        ws.send(JSON.stringify({ type: 'error', message: 'playback_control_failed' }));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws.roomId && ws.isAuthed) {
      broadcastToRoomExcept(ws.roomId, ws, {
        type: 'presence',
        event: 'left',
        senderId: ws.userId,
        senderLabel: ws.senderLabel || 'Guest',
        createdAt: new Date().toISOString(),
      });
    }
  });
});
