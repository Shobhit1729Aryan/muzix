"use client"

import React, { useState } from "react"
import { signIn, useSession } from "next-auth/react"
import { Appbar } from "../components/Appbar"

// Dashboard page: simple host / join UI

export default function DashboardPage() {
  const { data: session } = useSession()
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [hostUsername, setHostUsername] = useState("")
  const [joinUsername, setJoinUsername] = useState("")
  const [joinCode, setJoinCode] = useState("")
  const [joinPassword, setJoinPassword] = useState("")
  const [error, setError] = useState("")
  async function handleCreate() {
    setError("")
    const normalizedUsername = hostUsername.trim()
    if (!normalizedUsername) {
      setError("Please enter a username before creating a room")
      return
    }
    if (!session?.user?.email) {
      await signIn("google", { callbackUrl: "/dashboard" })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/room/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.message || 'Failed to create room')
        return
      }
      if (data?.roomId) {
        window.location.href = `/room/${data.roomId}?username=${encodeURIComponent(normalizedUsername)}`
      } else {
        setError('Room was created incorrectly. Please try again.')
      }
    } catch (e) {
      console.error(e)
      setError('Could not create room. Please try again.')
    } finally { setCreating(false) }
  }
  async function handleJoin() {
    setError("")
    const normalizedUsername = joinUsername.trim()
    if (!normalizedUsername) {
      setError("Please enter a username before joining a room")
      return
    }
    setJoining(true)
    try {
      const res = await fetch('/api/room/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: joinCode, password: joinPassword }) })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.message || 'Failed to join room')
        return
      }
      if (data?.roomId) {
        window.location.href = `/room/${data.roomId}?username=${encodeURIComponent(normalizedUsername)}`
      } else {
        setError(data?.message || 'Failed to join')
      }
    } catch (e) {
      console.error(e)
      setError('Could not join room. Please try again.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="bg-[#080b12] text-[#5a6480] font-mono overflow-x-hidden min-h-screen">
      <Appbar />
      <section className="min-h-screen flex items-center justify-center">
        <div className="max-w-3xl w-full px-6 py-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold">Host or Join a Room</h1>
            <p className="text-sm text-[#5a6480] mt-2">Create a live room or enter a code to join.</p>
          </div>

          {error ? (
            <div className="mb-6 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#0d1220] p-6 border border-white/5 rounded">
              <h3 className="font-semibold mb-4">Host a Room</h3>
              <p className="text-sm text-[#5a6480] mb-4">Create a room and become the host.</p>
              <input className="w-full mb-4 p-2 bg-transparent border border-white/5 rounded" placeholder="Your username" value={hostUsername} onChange={(e)=>setHostUsername(e.target.value)} />
              <button className="bg-[#7DF9C2] px-4 py-2 rounded text-[#08110d] font-semibold disabled:opacity-70" onClick={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'Host a Room'}</button>
            </div>

            <div className="bg-[#0d1220] p-6 border border-white/5 rounded">
              <h3 className="font-semibold mb-4">Join a Room</h3>
              <input className="w-full mb-2 p-2 bg-transparent border border-white/5 rounded" placeholder="Your username" value={joinUsername} onChange={(e)=>setJoinUsername(e.target.value)} />
              <input className="w-full mb-2 p-2 bg-transparent border border-white/5 rounded" placeholder="Room code" value={joinCode} onChange={(e)=>setJoinCode(e.target.value)} />
              <input className="w-full mb-4 p-2 bg-transparent border border-white/5 rounded" placeholder="Password (if any)" value={joinPassword} onChange={(e)=>setJoinPassword(e.target.value)} />
              <button className="bg-[#7DF9C2] px-4 py-2 rounded text-[#08110d] font-semibold disabled:opacity-70" onClick={handleJoin} disabled={joining}>{joining ? 'Joining...' : 'Join Room'}</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
