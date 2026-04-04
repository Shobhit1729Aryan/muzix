"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, MessageCircle, Pause, Play, QrCode, RotateCcw, RotateCw, Search, Send, SkipForward, X } from 'lucide-react'
import { Appbar } from '../../components/Appbar'

type Song = {
  id: string
  title: string
  thumbnail: string
  url: string
  votes: number
}

type SearchResult = {
  id: string
  title: string
  thumbnail: string
  url: string
}

type RoomDetails = {
  id: string
  code: string
  password: string | null
  hostId: string
}

type PlaybackState = {
  currentSongId: string | null
  isPlaying: boolean
  positionSeconds: number
  updatedAt: number
}

type ChatEncryptedMessage = {
  id: string
  senderId: string
  senderLabel: string
  ciphertext: string
  iv: string
  createdAt: string
}

type ChatPresenceEvent = {
  id: string
  kind: 'presence'
  senderId?: string
  senderLabel: string
  event: 'joined' | 'left'
  createdAt: string
}

type ChatSongEvent = {
  id: string
  kind: 'song'
  senderId?: string
  senderLabel: string
  songTitle: string
  createdAt: string
}

type ChatRawItem =
  | ({ kind: 'message' } & ChatEncryptedMessage)
  | ChatPresenceEvent
  | ChatSongEvent

type ChatDisplayItem = {
  id: string
  kind: 'message' | 'presence' | 'song'
  senderId?: string
  senderLabel: string
  text: string
  createdAt: string
  mine?: boolean
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function deriveChatKey(seed: string) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(seed),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 120000,
      salt: textEncoder.encode('muzix-room-chat'),
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptChatText(text: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    textEncoder.encode(text),
  )

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

async function decryptChatText(ciphertext: string, iv: string, key: CryptoKey) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(iv),
    },
    key,
    base64ToBytes(ciphertext),
  )

  return textDecoder.decode(plaintext)
}

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = React.use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const inviteMode = searchParams.get('invite') === '1'
  const [songs, setSongs] = useState<Song[]>([])
  const [room, setRoom] = useState<RoomDetails | null>(null)
  const [input, setInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [currentSongId, setCurrentSongId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null)
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [roomError, setRoomError] = useState('')
  const [youtubeApiReady, setYoutubeApiReady] = useState(false)
  const [copiedState, setCopiedState] = useState<'idle' | 'code' | 'link'>('idle')
  const [chatOpen, setChatOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [queueToast, setQueueToast] = useState<string | null>(null)
  const [roomUsername, setRoomUsername] = useState('')
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernamePromptOpen, setUsernamePromptOpen] = useState(false)
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null)
  const [chatRawItems, setChatRawItems] = useState<ChatRawItem[]>([])
  const [chatItems, setChatItems] = useState<ChatDisplayItem[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatError, setChatError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const wsAuthTokenRef = useRef<string | null>(null)
  const wsAuthedRef = useRef(false)
  const lastWsActionRef = useRef<'chat' | 'vote' | null>(null)
  const playerHostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const currentSongIdRef = useRef<string | null>(null)
  const loadedSongIdRef = useRef<string | null>(null)
  const roomUsernameRef = useRef('')

  function leaveRoomBeforeSignOut() {
    setChatOpen(false)
    wsAuthedRef.current = false
    wsAuthTokenRef.current = null
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    } catch {}
    try {
      playerRef.current?.destroy?.()
    } catch {}
    playerRef.current = null
  }

  function exitRoom() {
    leaveRoomBeforeSignOut()
    router.push('/dashboard')
  }

  function getUsernameStorageKey() {
    return `muzix-room-username:${roomId}:${session?.user?.email || 'guest'}`
  }

  function saveRoomUsername() {
    const normalizedUsername = usernameDraft.trim()
    if (!normalizedUsername) return
    setRoomUsername(normalizedUsername)
    roomUsernameRef.current = normalizedUsername
    if (typeof window !== 'undefined' && session?.user?.email) {
      window.localStorage.setItem(getUsernameStorageKey(), normalizedUsername)
    }
    setUsernamePromptOpen(false)
  }

  useEffect(() => {
    if (inviteMode && status === 'unauthenticated') {
      setRoomUsername('')
      roomUsernameRef.current = ''
      setUsernameDraft('')
      setUsernamePromptOpen(false)
      return
    }
    const usernameFromQuery = searchParams.get('username')?.trim() || ''
    const storageKey = getUsernameStorageKey()
    const storedUsername = session?.user?.email && typeof window !== 'undefined'
      ? window.localStorage.getItem(storageKey)?.trim() || ''
      : ''
    const nextUsername = usernameFromQuery || storedUsername
    if (!nextUsername) {
      setRoomUsername('')
      roomUsernameRef.current = ''
      setUsernameDraft('')
      setUsernamePromptOpen(true)
      return
    }
    setRoomUsername(nextUsername)
    setUsernameDraft(nextUsername)
    roomUsernameRef.current = nextUsername
    setUsernamePromptOpen(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, nextUsername)
    }
  }, [inviteMode, roomId, searchParams, session?.user?.email, status])

  useEffect(() => {
    if (!roomUsername) return
    roomUsernameRef.current = roomUsername
  }, [roomUsername])

  useEffect(() => {
    fetch(`/api/room/${roomId}`).then(r => r.json()).then((d) => {
      if (d?.room) {
        setRoom(d.room)
        setSongs(d.room.songs || [])
      }
    }).catch(()=>{
      setRoomError('Could not load room details.')
    })
    const host = window.location.hostname || 'localhost'
    const ws = new WebSocket(`ws://${host}:3001`)
    wsRef.current = ws
    ws.addEventListener('open', () => {
      setSocketStatus('connected')
      setRoomError('')
      ws.send(JSON.stringify({ type: 'join', roomId }))
      if (status === 'authenticated') {
        ensureWsAuth()
      }
      if (wsAuthTokenRef.current) {
        ws.send(JSON.stringify({ type: 'auth', token: wsAuthTokenRef.current, displayName: roomUsernameRef.current || undefined }))
        wsAuthedRef.current = true
      }
    })
    ws.addEventListener('error', () => {
      setSocketStatus('disconnected')
      setRoomError('Live room server is not connected. Start the websocket server and refresh.')
    })
    ws.addEventListener('close', () => {
      setSocketStatus('disconnected')
    })
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'init') {
          setSongs(msg.queue || [])
          setCurrentSongId(msg.currentSongId ?? null)
          if (msg.playbackState) setPlaybackState(msg.playbackState)
        }
        if (msg.type === 'voteUpdate') {
          setSongs((s) => s.map(song => song.id === msg.songId ? { ...song, votes: msg.votes } : song))
        }
        if (msg.type === 'playbackSync' && msg.playbackState) {
          setPlaybackState(msg.playbackState)
          setCurrentSongId(msg.playbackState.currentSongId ?? null)
        }
        if (msg.type === 'chatHistory') {
          setChatRawItems((existingItems) => {
            const nextItems = [
              ...existingItems.filter((item) => item.kind === 'presence'),
              ...(msg.messages || []).map((message: ChatEncryptedMessage) => ({ ...message, kind: 'message' as const })),
            ]
            return nextItems.sort(
              (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
            )
          })
        }
        if (msg.type === 'chatMessage' && msg.message) {
          setChatRawItems((existingItems) =>
            [...existingItems, { ...msg.message, kind: 'message' as const }].sort(
              (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
            ),
          )
        }
        if (msg.type === 'presence') {
          setChatRawItems((existingItems) =>
            [
              ...existingItems,
              {
                id: `presence-${msg.senderId || msg.senderLabel}-${msg.event}-${msg.createdAt}`,
                kind: 'presence' as const,
                senderId: msg.senderId,
                senderLabel: msg.senderLabel || 'Guest',
                event: msg.event,
                createdAt: msg.createdAt || new Date().toISOString(),
              },
            ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
          )
        }
        if (msg.type === 'songAdded') {
          const createdAt = msg.createdAt || new Date().toISOString()
          const rawSenderLabel = msg.senderLabel || 'Guest'
          const senderLabel = withHostLabel(msg.senderId, rawSenderLabel)
          const songTitle = msg.songTitle || 'Unknown Song'
          setQueueToast(`${senderLabel} added "${songTitle}"`)
          setChatRawItems((existingItems) =>
            [
              ...existingItems,
              {
                id: `song-${senderLabel}-${songTitle}-${createdAt}`,
                kind: 'song' as const,
                senderId: msg.senderId,
                senderLabel: rawSenderLabel,
                songTitle,
                createdAt,
              },
            ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
          )
        }
        if (msg.type === 'error') {
          const message = String(msg.message || 'unknown_error')
          if (message.startsWith('chat_')) {
            setChatError('Chat action failed. Try again in a moment.')
            return
          }
          if (message === 'not_authenticated') {
            if (lastWsActionRef.current === 'chat') {
              setChatError('Chat needs authentication. Refresh the room and try again.')
              ensureWsAuth()
              return
            }
            ensureWsAuth()
          }
          setRoomError(`Room action failed: ${message}`)
        }
      } catch (e) {}
    })
    return () => ws.close()
  }, [roomId, status])

  useEffect(() => {
    currentSongIdRef.current = currentSongId
  }, [currentSongId])

  useEffect(() => {
    if (!room?.code) return
    const seed = `${room.id}:${room.code}`
    deriveChatKey(seed)
      .then((key) => {
        setChatKey(key)
        setChatError('')
      })
      .catch(() => {
        setChatError('Could not initialize encrypted chat on this device.')
      })
  }, [room?.code, room?.id])

  useEffect(() => {
    if (!chatKey) {
      setChatItems(
        chatRawItems
          .filter((item) => item.kind === 'presence' || item.kind === 'song')
          .map((item) => ({
            id: item.id,
            kind: item.kind === 'song' ? 'song' as const : 'presence' as const,
            senderId: item.senderId,
            senderLabel: withHostLabel(item.senderId, item.senderLabel),
            text: item.kind === 'song'
              ? `${withHostLabel(item.senderId, item.senderLabel)} added "${item.songTitle}" to the queue`
              : `${withHostLabel(item.senderId, item.senderLabel)} ${item.event === 'joined' ? 'joined' : 'left'} the room`,
            createdAt: item.createdAt,
          })),
      )
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const nextItems = await Promise.all(
          chatRawItems.map(async (item) => {
            if (item.kind === 'presence') {
              return {
                id: item.id,
                kind: 'presence' as const,
                senderId: item.senderId,
                senderLabel: withHostLabel(item.senderId, item.senderLabel),
                text: `${withHostLabel(item.senderId, item.senderLabel)} ${item.event === 'joined' ? 'joined' : 'left'} the room`,
                createdAt: item.createdAt,
              }
            }

            if (item.kind === 'song') {
              return {
                id: item.id,
                kind: 'song' as const,
                senderId: item.senderId,
                senderLabel: withHostLabel(item.senderId, item.senderLabel),
                text: `${withHostLabel(item.senderId, item.senderLabel)} added "${item.songTitle}" to the queue`,
                createdAt: item.createdAt,
              }
            }

            const text = await decryptChatText(item.ciphertext, item.iv, chatKey)
            return {
              id: item.id,
              kind: 'message' as const,
              senderId: item.senderId,
              senderLabel: withHostLabel(item.senderId, item.senderLabel),
              text,
              createdAt: item.createdAt,
              mine: item.senderId === currentUserId,
            }
          }),
        )

        if (cancelled) return
        setChatItems(nextItems)
        setChatError('')
      } catch {
        if (cancelled) return
        setChatItems(
          chatRawItems
            .filter((item) => item.kind === 'presence' || item.kind === 'song')
            .map((item) => ({
              id: item.id,
              kind: item.kind === 'song' ? 'song' as const : 'presence' as const,
              senderId: item.senderId,
              senderLabel: withHostLabel(item.senderId, item.senderLabel),
              text: item.kind === 'song'
                ? `${withHostLabel(item.senderId, item.senderLabel)} added "${item.songTitle}" to the queue`
                : `${withHostLabel(item.senderId, item.senderLabel)} ${item.event === 'joined' ? 'joined' : 'left'} the room`,
              createdAt: item.createdAt,
            })),
        )
        setChatError('Wrong chat passphrase or unreadable encrypted messages.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatKey, chatRawItems, currentUserId])

  useEffect(() => {
    if (!chatOpen) return
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [chatItems, chatOpen])

  useEffect(() => {
    if (!queueToast) return
    const timeout = window.setTimeout(() => setQueueToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [queueToast])

  useEffect(() => {
    if (status !== 'authenticated' || !roomUsername) return
    ensureWsAuth()
  }, [status, roomUsername])

  async function ensureWsAuth() {
    if (status !== 'authenticated' || !roomUsernameRef.current) return
    try {
      const res = await fetch('/api/ws-auth')
      if (!res.ok) return
      const d = await res.json()
      if (d?.userId) setCurrentUserId(d.userId)
      if (d?.token) {
        wsAuthTokenRef.current = d.token
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'auth', token: d.token, displayName: roomUsernameRef.current || undefined }))
          wsAuthedRef.current = true
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (status !== 'authenticated' || !roomUsername) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    fetch('/api/ws-auth').then(r => r.json()).then(d => {
      if (d?.userId) setCurrentUserId(d.userId)
      if (d?.token) wsRef.current?.send(JSON.stringify({ type: 'auth', token: d.token, displayName: roomUsernameRef.current || undefined }))
    }).catch(() => {})
  }, [status, roomUsername])

  const isHost = !!currentUserId && room?.hostId === currentUserId

  function withHostLabel(senderId: string | undefined, senderLabel: string) {
    if (senderLabel.endsWith(' (Host)')) {
      return senderLabel
    }
    if (senderId && room?.hostId === senderId) {
      return `${senderLabel} (Host)`
    }
    return senderLabel
  }

  useEffect(() => {
    if (copiedState === 'idle') return
    const timeout = window.setTimeout(() => setCopiedState('idle'), 1800)
    return () => window.clearTimeout(timeout)
  }, [copiedState])

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(async () => {
      try {
        setSearching(true)
        const query = searchQuery.trim()
        const response = await fetch(`/api/youtube/search${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        const data = await response.json()
        if (!active) return
        setSearchResults(data.items || [])
      } catch {
        if (!active) return
        setSearchResults([])
      } finally {
        if (active) setSearching(false)
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [searchQuery])

  useEffect(() => {
    const windowWithYT = window as Window & { YT?: any; onYouTubeIframeAPIReady?: () => void }
    if (windowWithYT.YT?.Player) {
      setYoutubeApiReady(true)
      return
    }

    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    const previousReady = windowWithYT.onYouTubeIframeAPIReady
    windowWithYT.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      setYoutubeApiReady(true)
    }

    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(script)
    }
  }, [])

  function parseYouTubeId(url: string) {
    try { const u = new URL(url); if (u.hostname.includes('youtube.com')) return u.searchParams.get('v'); if (u.hostname === 'youtu.be') return u.pathname.slice(1) } catch(e) { return null }
    return null
  }

  function sendSongToQueue(song: Song) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const addedByLabel = roomUsernameRef.current || session?.user?.email?.split('@')[0] || 'Guest'
      wsRef.current.send(JSON.stringify({ type: 'add', roomId, song: { ...song, addedByLabel } }))
    } else {
      setRoomError('Cannot add to queue because the live room server is offline.')
      return false
    }
    return true
  }

  async function addSong() {
    const id = parseYouTubeId(input.trim())
    if (!id) {
      setRoomError('Paste a valid YouTube link or choose one of the search suggestions.')
      return
    }
    const song: Song = { id, title: 'YouTube Video', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}`, votes: 0 }
    if (!sendSongToQueue(song)) return
    setInput('')
    setSearchQuery('')
    setSearchResults([])
  }

  function handleUnifiedInputChange(value: string) {
    setInput(value)
    if (parseYouTubeId(value.trim())) {
      setSearchQuery('')
      setSearchResults([])
      return
    }
    setSearchQuery(value)
  }

  function addSearchedSong(result: SearchResult) {
    const song: Song = {
      id: result.id,
      title: result.title,
      thumbnail: result.thumbnail,
      url: result.url,
      votes: 0,
    }
    if (!sendSongToQueue(song)) return
    setInput('')
    setSearchQuery('')
    setSearchResults([])
  }

  function vote(songId: string, dir: number) {
    if (status !== 'authenticated') { signIn(); return }
    lastWsActionRef.current = 'vote'
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (!wsAuthedRef.current) ensureWsAuth()
      wsRef.current.send(JSON.stringify({ type: 'vote', roomId, songId, vote: dir }))
    }
  }

  function sendPlaybackControl(action: 'play' | 'pause' | 'seek', positionSeconds?: number) {
    if (!isHost) {
      setRoomError('Only the host can control playback.')
      return
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'playbackControl', roomId, action, positionSeconds }))
    }
  }

  function togglePlayback() {
    const currentTime = playerRef.current?.getCurrentTime?.() ?? 0
    sendPlaybackControl(playbackState?.isPlaying ? 'pause' : 'play', currentTime)
  }

  function playNextHighestVotedSong() {
    if (!isHost) {
      setRoomError('Only the host can control playback.')
      return
    }
    const currentId = currentSongIdRef.current
    if (!currentId) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'songEnded', roomId, songId: currentId }))
    }
  }

  async function copyRoomCode() {
    if (!room?.code) return
    await navigator.clipboard.writeText(room.code)
    setCopiedState('code')
  }

  async function copyRoomLink() {
    const shareLink = getRoomLink()
    await navigator.clipboard.writeText(shareLink)
    setCopiedState('link')
  }

  function getRoomLink() {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/room/${roomId}?invite=1`
  }

  function getQrJoinLink() {
    const roomLink = getRoomLink()
    if (!roomLink || typeof window === 'undefined') return ''
    return `${window.location.origin}/api/auth/signin?callbackUrl=${encodeURIComponent(roomLink)}`
  }

  function openQrModal() {
    setQrOpen(true)
  }

  async function sendChatMessage() {
    if (status !== 'authenticated') {
      signIn()
      return
    }
    if (!chatKey) {
      setChatError('Chat is still initializing. Try again in a moment.')
      return
    }
    if (!chatDraft.trim()) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setChatError('Room chat is offline right now.')
      return
    }

    try {
      lastWsActionRef.current = 'chat'
      if (!wsAuthedRef.current) {
        await ensureWsAuth()
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      const encrypted = await encryptChatText(chatDraft.trim(), chatKey)
      wsRef.current.send(JSON.stringify({ type: 'chatMessage', roomId, ...encrypted }))
      setChatDraft('')
      setChatError('')
    } catch {
      setChatError('Could not encrypt the chat message on this device.')
    }
  }

  const sorted = useMemo(() => [...songs].sort((a,b)=>b.votes-a.votes), [songs])
  const currentSong = useMemo(() => {
    if (!currentSongId) return sorted[0] ?? null
    return songs.find((song) => song.id === currentSongId) ?? sorted[0] ?? null
  }, [currentSongId, songs, sorted])

  function getDesiredPositionSeconds(state: PlaybackState | null) {
    if (!state) return 0
    if (!state.isPlaying) return state.positionSeconds
    const elapsedSeconds = Math.max(0, (Date.now() - state.updatedAt) / 1000)
    return state.positionSeconds + elapsedSeconds
  }

  useEffect(() => {
    const windowWithYT = window as Window & { YT?: any }
    if (!youtubeApiReady || !playerHostRef.current) return

    if (!currentSong) {
      if (playerRef.current?.destroy) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      loadedSongIdRef.current = null
      playerHostRef.current.innerHTML = ''
      return
    }

    const handlePlayerStateChange = (event: any) => {
      if (event.data === windowWithYT.YT.PlayerState.ENDED) {
        const finishedSongId = currentSongIdRef.current
        if (isHost && finishedSongId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'songEnded', roomId, songId: finishedSongId }))
        }
      }
    }

    if (!playerRef.current) {
      playerRef.current = new windowWithYT.YT.Player(playerHostRef.current, {
        videoId: currentSong.id,
        playerVars: {
          autoplay: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
        },
        events: {
          onStateChange: handlePlayerStateChange,
        },
      })
      loadedSongIdRef.current = currentSong.id
      return
    }

    if (loadedSongIdRef.current !== currentSong.id) {
      playerRef.current.loadVideoById(currentSong.id)
      loadedSongIdRef.current = currentSong.id
    }
  }, [currentSong?.id, isHost, roomId, youtubeApiReady])

  useEffect(() => {
    if (!playerRef.current || !currentSong || !playbackState) return
    if (playbackState.currentSongId !== currentSong.id) return

    const desiredPosition = getDesiredPositionSeconds(playbackState)
    const currentPosition = typeof playerRef.current.getCurrentTime === 'function'
      ? playerRef.current.getCurrentTime()
      : 0

    if (typeof playerRef.current.seekTo === 'function' && Math.abs(currentPosition - desiredPosition) > 1.5) {
      playerRef.current.seekTo(desiredPosition, true)
    }

    if (playbackState.isPlaying) {
      playerRef.current.playVideo?.()
    } else {
      playerRef.current.pauseVideo?.()
    }
  }, [currentSong?.id, playbackState])

  return (
      <main className="bg-[#080b12] min-h-screen text-[#5a6480] overflow-x-hidden">
        <Appbar
          roomActionLabel="Exit Room"
          mobileRoomActionLabel="Exit"
          onRoomAction={exitRoom}
          onSignOut={leaveRoomBeforeSignOut}
          signOutCallbackUrl="/"
          mobileActions={
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="flex h-8 min-w-[3.5rem] items-center justify-center whitespace-nowrap rounded border border-white/10 px-3 text-xs font-semibold text-white"
              onClick={copyRoomCode}
              type="button"
            >
              {copiedState === 'code' ? 'Copied' : 'Code'}
            </button>
            <button
              className="flex h-8 min-w-[3.5rem] items-center justify-center whitespace-nowrap rounded bg-[#7DF9C2] px-3 text-xs font-semibold text-[#08110d]"
              onClick={copyRoomLink}
              type="button"
            >
              {copiedState === 'link' ? 'Copied' : 'Link'}
            </button>
            <button
              className="flex h-8 min-w-[3.5rem] items-center justify-center whitespace-nowrap rounded border border-white/10 px-3 text-xs font-semibold text-white"
              onClick={openQrModal}
              type="button"
            >
              QR
            </button>
          </div>
        }
      />
      <section className="w-full max-w-6xl mx-auto py-4 sm:py-8 px-2 sm:px-6">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Room</h2>
            <div className="text-[11px] sm:text-xs text-[#5a6480] flex flex-wrap gap-x-2 gap-y-1">
              <span>Live: {socketStatus}</span>
              {session?.user?.email && <span className="px-2 py-1 bg-[#24303a] rounded text-[#7DF9C2] text-xs">Signed in</span>}
            </div>
          </div>
          <div className="hidden sm:flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="rounded border border-white/10 px-3 py-2 text-xs text-white w-full sm:w-auto"
              onClick={copyRoomCode}
              type="button"
            >
              {copiedState === 'code' ? 'Code Copied' : 'Copy Room Code'}
            </button>
            <button
              className="rounded bg-[#7DF9C2] px-3 py-2 text-xs font-semibold text-[#08110d] w-full sm:w-auto"
              onClick={copyRoomLink}
              type="button"
            >
              {copiedState === 'link' ? 'Link Copied' : 'Share Room Link'}
            </button>
            <button
              className="flex w-full items-center justify-center gap-2 rounded border border-white/10 px-3 py-2 text-xs font-semibold text-white sm:w-auto"
              onClick={openQrModal}
              type="button"
            >
              <QrCode size={14} />
              <span>Generate QR</span>
            </button>
          </div>
        </div>

        {roomError ? (
          <div className="mb-6 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {roomError}
          </div>
        ) : null}

        <div className="grid gap-3 sm:gap-6 md:grid-cols-3">
          <div className="space-y-4 md:col-span-2 sm:space-y-6 min-w-0">
            <div className="bg-[#0d1220] p-2 sm:p-4 rounded border border-white/5">
              <h3 className="font-semibold mb-2 text-white">Now Playing</h3>
              {currentSong ? (
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex justify-center w-full">
                    <div className="relative w-full aspect-video overflow-hidden rounded bg-black">
                      <div
                        ref={playerHostRef}
                        className="relative h-full w-full max-w-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:max-h-full"
                      />
                      <div
                        className="absolute inset-0 z-10"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-white truncate text-sm sm:text-base">{currentSong.title}</div>
                    <div className="text-xs text-[#5a6480] hidden sm:block">{currentSong.url}</div>
                  </div>
                  {isHost ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button
                          aria-label="Back 10 seconds"
                          className="rounded bg-[#15202b] p-1.5 sm:p-2 text-white"
                          onClick={() => {
                            const currentTime = playerRef.current?.getCurrentTime?.() ?? 0
                            sendPlaybackControl('seek', Math.max(0, currentTime - 10))
                          }}
                          type="button"
                        >
                          <RotateCcw size={14} className="sm:hidden" />
                          <RotateCcw size={16} className="hidden sm:block" />
                        </button>
                        <button
                          aria-label={playbackState?.isPlaying ? 'Pause' : 'Play'}
                          className="rounded bg-[#15202b] p-1.5 sm:p-2 text-white"
                          onClick={togglePlayback}
                          type="button"
                        >
                          {playbackState?.isPlaying ? (
                            <>
                              <Pause size={14} className="sm:hidden" />
                              <Pause size={16} className="hidden sm:block" />
                            </>
                          ) : (
                            <>
                              <Play size={14} className="sm:hidden" />
                              <Play size={16} className="hidden sm:block" />
                            </>
                          )}
                        </button>
                        <button
                          aria-label="Forward 10 seconds"
                          className="rounded bg-[#15202b] p-1.5 sm:p-2 text-white"
                          onClick={() => {
                            const currentTime = playerRef.current?.getCurrentTime?.() ?? 0
                            sendPlaybackControl('seek', currentTime + 10)
                          }}
                          type="button"
                        >
                          <RotateCw size={14} className="sm:hidden" />
                          <RotateCw size={16} className="hidden sm:block" />
                        </button>
                        <button
                          aria-label="Play next highest-voted song"
                          className="rounded bg-[#15202b] p-1.5 sm:p-2 text-white"
                          onClick={playNextHighestVotedSong}
                          type="button"
                        >
                          <SkipForward size={14} className="sm:hidden" />
                          <SkipForward size={16} className="hidden sm:block" />
                        </button>
                      </div>
                      <div className="text-xs text-[#7DF9C2] hidden sm:block">
                        Host controls playback for everyone in the room.
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-[#5a6480]">Host or join the room, then paste a YouTube URL on the right to start using the app.</div>
              )}
            </div>

            <div className="bg-[#0d1220] p-2 sm:p-4 rounded border border-white/5">
              <h3 className="font-semibold mb-2 text-white">Queue</h3>
              <div className="max-h-[12rem] sm:max-h-[32rem] space-y-2 sm:space-y-3 overflow-y-auto overflow-x-hidden pr-1 w-full">
                {sorted.map(s => (
                  <div key={s.id} className="flex items-center gap-1 sm:gap-2 bg-[#080b12] p-2 sm:p-2 rounded min-w-0">
                    <img src={s.thumbnail} className="h-9 w-11 sm:w-14 sm:h-10 object-cover rounded shrink-0" alt={s.title} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[11px] sm:text-sm text-white truncate">{s.title}</div>
                      <div className="hidden truncate text-[10px] text-[#5a6480] sm:block sm:text-xs">{s.url}</div>
                    </div>
                    <div className="mr-0.5 flex items-center gap-0.5 shrink-0">
                      <button className="h-4.5 w-4.5 sm:w-auto sm:h-auto px-0 sm:px-2 py-0 sm:py-1 bg-[#15202b] rounded text-[9px] sm:text-xs text-white" onClick={()=>vote(s.id,1)} type="button">^</button>
                      <div className="w-3.5 text-center text-[9px] sm:w-auto sm:text-sm">{s.votes}</div>
                      <button className="h-4.5 w-4.5 sm:w-auto sm:h-auto px-0 sm:px-2 py-0 sm:py-1 bg-[#15202b] rounded text-[9px] sm:text-xs text-white" onClick={()=>vote(s.id,-1)} type="button">v</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="bg-[#0d1220] p-2.5 sm:p-4 rounded border border-white/5 min-w-0">
            <h4 className="font-semibold mb-2 text-white">Add Song</h4>
            <p className="mb-2 text-xs sm:text-sm text-[#5a6480]">Use one search bar for both pasted YouTube links and song search. Recommendations appear as you type.</p>
            <div className="mb-2 rounded border border-white/10 bg-[#080b12] p-2.5 sm:p-3 text-[11px] sm:text-xs text-[#9aa4bf]">
              Share this room using the current page link, or let friends join using room code:
              <span className="ml-2 text-[#7DF9C2]">{room?.code ?? 'Loading...'}</span>
            </div>
            <div className="mb-2 flex items-center gap-2 text-sm text-white">
              <Search size={16} />
              <span>Search Or Paste Link</span>
            </div>
            <input
              className="mb-2 w-full rounded border border-white/5 bg-transparent p-2 text-sm text-white"
              placeholder="Search song, artist, or paste YouTube link"
              value={input}
              onChange={(e) => handleUnifiedInputChange(e.target.value)}
            />
            <button className="w-full rounded bg-[#7DF9C2] px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold text-[#08110d]" onClick={addSong}>Add</button>

            <div className="mt-3 max-h-64 sm:mt-4 sm:max-h-80 space-y-2 overflow-y-auto">
              {searching ? (
                <div className="text-xs text-[#5a6480]">Searching...</div>
              ) : null}
              {!searching && searchQuery.trim() && searchResults.length === 0 ? (
                <div className="text-xs text-[#5a6480]">No recommendations found.</div>
              ) : null}
              {!searching && !searchQuery.trim() && searchResults.length === 0 ? (
                <div className="text-xs text-[#5a6480]">Start typing to see song recommendations, or paste a YouTube link above.</div>
              ) : null}
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  className="flex w-full items-center gap-3 rounded border border-white/5 bg-[#080b12] p-2 text-left min-w-0"
                  onClick={() => addSearchedSong(result)}
                  type="button"
                >
                  <img src={result.thumbnail} alt={result.title} className="h-12 w-16 rounded object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{result.title}</div>
                    <div className="truncate text-xs text-[#5a6480]">{result.url}</div>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <button
        aria-label="Open room chat"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 rounded-full border border-white/10 bg-[#7DF9C2] p-4 text-[#08110d] shadow-lg shadow-[#7DF9C2]/20 transition hover:scale-105"
        onClick={() => setChatOpen(true)}
        type="button"
      >
        <MessageCircle size={20} />
      </button>

      {queueToast ? (
        <div className="fixed left-1/2 top-24 z-30 w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0d1220]/95 px-4 py-3 text-center text-sm text-white shadow-2xl shadow-black/40 backdrop-blur-sm">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#7DF9C2]">Queue Update</div>
          <div className="mt-1">{queueToast}</div>
        </div>
      ) : null}

      {inviteMode && status === 'unauthenticated' ? (
        <section className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="text-lg font-semibold text-white">Sign In To Join Room</div>
            <div className="mt-1 text-sm text-[#9aa4bf]">This shared room link asks users to sign in before entering the room.</div>
            <button
              className="mt-4 w-full rounded bg-[#7DF9C2] px-3 py-2 text-sm font-semibold text-[#08110d]"
              onClick={() => signIn('google', { callbackUrl: getRoomLink() })}
              type="button"
            >
              Sign In With Google
            </button>
          </div>
        </section>
      ) : null}

      {usernamePromptOpen ? (
        <section className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl shadow-black/40 sm:p-5">
            <div className="text-lg font-semibold text-white">Set Your Username</div>
            <div className="mt-1 text-sm text-[#9aa4bf]">Choose the name that should appear in chat, queue popups, and room activity.</div>
            <input
              autoFocus
              className="mt-4 w-full rounded border border-white/10 bg-[#080b12] px-3 py-2 text-sm text-white"
              onChange={(event) => setUsernameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  saveRoomUsername()
                }
              }}
              placeholder="Enter username"
              value={usernameDraft}
            />
            <button
              className="mt-4 w-full rounded bg-[#7DF9C2] px-3 py-2 text-sm font-semibold text-[#08110d]"
              onClick={saveRoomUsername}
              type="button"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {qrOpen ? (
        <section className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm" onClick={() => setQrOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1220] p-4 shadow-2xl shadow-black/40 sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-white">Scan To Join Room</div>
                <div className="mt-1 text-xs text-[#9aa4bf]">Scanning opens sign-in first, then brings the user into this room.</div>
              </div>
              <button
                aria-label="Close QR modal"
                className="rounded bg-[#15202b] p-2 text-white"
                onClick={() => setQrOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <div className="rounded-2xl bg-white p-3">
                <img
                  alt="Room join QR code"
                  className="h-56 w-56 max-w-full rounded-xl"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(getQrJoinLink())}`}
                />
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-[#080b12] px-3 py-2 text-[11px] text-[#9aa4bf] break-all">
              {getQrJoinLink()}
            </div>
          </div>
        </section>
      ) : null}

      {chatOpen ? (
        <section className="fixed left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 z-40 flex h-[75vh] sm:h-[32rem] w-auto sm:w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1220] shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">Encrypted Room Chat</div>
              <div className="text-xs text-[#7d88a8]">Messages are encrypted in the room and decrypted on your device.</div>
            </div>
            <button
              aria-label="Close chat"
              className="rounded bg-[#15202b] p-2 text-white"
              onClick={() => setChatOpen(false)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-[#9aa4bf]">
              <Lock size={14} />
              <span>Chat is encrypted automatically for room members.</span>
            </div>
            {chatError ? <div className="mt-2 text-xs text-red-300">{chatError}</div> : null}
          </div>

          <div ref={chatScrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {chatItems.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 bg-[#080b12] px-3 py-4 text-center text-xs text-[#5a6480]">
                No chat activity yet. Joiners and leavers will appear here, and encrypted messages will unlock on this device.
              </div>
            ) : null}
            {chatItems.map((item) =>
              item.kind === 'presence' ? (
                <div key={item.id} className="text-center text-xs text-[#7d88a8]">
                  {item.text}
                </div>
              ) : item.kind === 'song' ? (
                <div key={item.id} className="text-center text-xs text-[#7DF9C2]">
                  {item.text}
                </div>
              ) : (
                <div key={item.id} className={`flex ${item.mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                      item.mine ? 'bg-[#7DF9C2] text-[#08110d]' : 'bg-[#15202b] text-white'
                    }`}
                  >
                    <div className={`text-[11px] ${item.mine ? 'text-[#153426]' : 'text-[#9aa4bf]'}`}>
                      {item.senderLabel}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm">{item.text}</div>
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            {status !== 'authenticated' ? (
              <button
                className="w-full rounded bg-[#7DF9C2] px-3 py-2 text-sm font-semibold text-[#08110d]"
                onClick={() => signIn()}
                type="button"
              >
                Sign In To Chat
              </button>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  className="min-h-[44px] flex-1 resize-none rounded border border-white/10 bg-[#080b12] px-3 py-2 text-sm text-white"
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder={chatKey ? 'Send an encrypted message' : 'Chat is still initializing'}
                  rows={2}
                  value={chatDraft}
                />
                <button
                  className="rounded bg-[#7DF9C2] p-3 text-[#08110d]"
                  disabled={!chatKey || !chatDraft.trim()}
                  onClick={sendChatMessage}
                  type="button"
                >
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  )
}





