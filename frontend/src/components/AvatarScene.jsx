/**
 * AvatarScene Component
 * 
 * 3D humanoid avatar for sign language display.
 * Uses a generic human base mesh styled to look like SignAvatars (smooth, solid color).
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

function AvatarScene({ currentSign, isPlaying, avatarUrl = '/avatar.glb' }) {
    const group = useRef()

    // 1. Load the "Animation Library" (our base avatar that has the clips)
    const { animations: libraryAnimations } = useGLTF('/avatar.glb')

    // 2. Load the actual display model (Ready Player Me or Default)
    const { scene: modelScene } = useGLTF(avatarUrl)

    // Clone the scene for safety and ensure shadows
    const avatarScene = useMemo(() => {
        const clone = modelScene.clone()
        clone.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
        return clone
    }, [modelScene])

    // Get animation actions using the Library Animations on our Group
    const { actions, mixer } = useAnimations(libraryAnimations, group)
    const [currentAction, setCurrentAction] = useState(null)
    const [queue, setQueue] = useState([])
    const [isAnimatingSeq, setIsAnimatingSeq] = useState(false)

    // A dictionary mapping Gloss words to animation clip names inside avatar.glb
    const signToClipMap = useMemo(() => ({
        'HELLO': 'Sign_Hello',
        'HI': 'Sign_Hello',
        'THANK_YOU': 'Sign_ThankYou',
        'THANKS': 'Sign_ThankYou',
        'YES': 'Sign_Yes',
        'NO': 'Sign_No',
        'PLEASE': 'Sign_Please',
        'SORRY': 'Sign_Sorry',
        'NAME': 'Sign_Name',
        'WHAT': 'Sign_What',
        'WHERE': 'Sign_Where',
        'WHO': 'Sign_Who',
        'WHY': 'Sign_Why',
        'HOW': 'Sign_How',
        'YOU': 'Sign_You',
        'ME': 'Sign_Me',
        'I': 'Sign_Me',
        'GOOD': 'Sign_Good',
        'BAD': 'Sign_Bad',
        'IDLE': 'Idle'
    }), [])

    // When the gloss sequence changes from props (SpeechToSignPanel), enqueue them.
    useEffect(() => {
        if (isPlaying && currentSign && Array.isArray(currentSign) && currentSign.length > 0) {
            setQueue([...currentSign])
            setIsAnimatingSeq(true)
        } else if (!isPlaying) {
            setQueue([])
            setIsAnimatingSeq(false)
            playAnimation('Idle')
        }
    }, [currentSign, isPlaying])

    // Helper to play a specific animation clip
    const playAnimation = useCallback((clipName) => {
        if (!actions) return

        let targetClipName = clipName
        if (!actions[targetClipName]) {
            console.warn(`[Avatar] Animation '${targetClipName}' not found. Fallback to Idle.`)
            targetClipName = 'Idle'
        }

        const newAction = actions[targetClipName]
        if (newAction && newAction !== currentAction) {
            if (currentAction) currentAction.fadeOut(0.3)

            newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play()

            if (targetClipName !== 'Idle') {
                newAction.setLoop(2200, 1) // LoopOnce 
                newAction.clampWhenFinished = true
            }
            setCurrentAction(newAction)
        }
    }, [actions, currentAction])

    // The main processing loop: listens for the end of animations to trigger the next one in queue
    useEffect(() => {
        if (!mixer || !isAnimatingSeq) return

        const handleFinished = (e) => {
            // Check if there are still signs in the queue
            if (queue.length > 0) {
                const nextSign = queue[0]
                const clipName = signToClipMap[nextSign] || 'Idle'
                playAnimation(clipName)

                // Remove the played sign from the queue
                setQueue(prev => prev.slice(1))
            } else {
                // Queue is empty, return to Idle
                playAnimation('Idle')
                setIsAnimatingSeq(false)
            }
        }

        mixer.addEventListener('finished', handleFinished)

        return () => {
            mixer.removeEventListener('finished', handleFinished)
        }
    }, [mixer, queue, isAnimatingSeq, playAnimation, signToClipMap])

    // Kick off the very first animation when the sequence starts
    useEffect(() => {
        if (isAnimatingSeq && queue.length > 0 && (!currentAction || currentAction._clip.name === 'Idle')) {
            const nextSign = queue[0]
            const clipName = signToClipMap[nextSign] || 'Idle'
            playAnimation(clipName)
            setQueue(prev => prev.slice(1))
        }
    }, [isAnimatingSeq, queue, currentAction, playAnimation, signToClipMap])

    return (
        <group ref={group} dispose={null}>
            <primitive object={avatarScene} scale={1.8} position={[0, -1.6, 0]} />
        </group>
    )
}

useGLTF.preload('/avatar.glb')
export default AvatarScene
