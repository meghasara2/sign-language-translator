/**
 * WebSocket Hook
 * 
 * Custom React hook for WebSocket communication with the backend.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

function useWebSocket(url) {
    const [isOpen, setIsOpen] = useState(false)
    const [lastMessage, setLastMessage] = useState(null)
    const [error, setError] = useState(null)
    const wsRef = useRef(null)
    const reconnectTimeoutRef = useRef(null)
    const reconnectAttemptsRef = useRef(0)
    const maxReconnectAttempts = 5

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (!url) return

        try {
            const ws = new WebSocket(url)

            ws.onopen = () => {
                console.log('WebSocket connected:', url)
                setIsOpen(true)
                setError(null)
                reconnectAttemptsRef.current = 0
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    setLastMessage(data)
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e)
                }
            }

            ws.onerror = (event) => {
                console.error('WebSocket error:', event)
                setError('Connection error')
            }

            ws.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason)
                setIsOpen(false)

                // Attempt to reconnect
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000)
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++
                        connect()
                    }, delay)
                }
            }

            wsRef.current = ws
        } catch (e) {
            console.error('Failed to create WebSocket:', e)
            setError('Failed to connect')
        }
    }, [url])

    // Disconnect
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
        }
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }
        setIsOpen(false)
    }, [])

    // Send message
    const send = useCallback((data) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data))
            return true
        }
        return false
    }, [])

    // Connect on mount, disconnect on unmount
    useEffect(() => {
        connect()
        return () => disconnect()
    }, [connect, disconnect])

    return {
        isOpen,
        lastMessage,
        error,
        send,
        connect,
        disconnect
    }
}

export default useWebSocket
