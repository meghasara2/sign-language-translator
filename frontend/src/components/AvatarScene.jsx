/**
 * AvatarScene Component
 * 
 * 3D humanoid avatar for sign language display.
 * Uses a generic human base mesh styled to look like SignAvatars (smooth, solid color).
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, Html } from '@react-three/drei'
import { useRef, useEffect, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

function AvatarScene({ currentSign, isPlaying }) {
    const group = useRef()

    // Load the avatar and its animations
    const { scene, animations } = useGLTF('/avatar.glb')
    const avatarScene = scene

    // Ensure shadows
    useEffect(() => {
        avatarScene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
    }, [avatarScene])

    // Get animation actions from the loaded GLTF
    const { actions } = useAnimations(animations, group)
    const [currentAction, setCurrentAction] = useState(null)

    // Dictionary mapping Gloss words to animation clip names inside avatar.glb
    // Note: If you don't have these specific clips yet, this maps to fallbacks
    const signToClipMap = {
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
        'IDLE': 'Idle' // Default rest pose
    }

    // Handle Animation Sequencing
    useEffect(() => {
        if (!actions) return

        // Determine which clip to play
        let targetClipName = 'Idle' // Default

        if (isPlaying && currentSign) {
            targetClipName = signToClipMap[currentSign] || 'Idle'

            // If the specific animation doesn't exist in the GLTF, fallback to Idle
            if (!actions[targetClipName]) {
                console.warn(`[Avatar] Animation clip '${targetClipName}' not found in avatar.glb. Falling back to Idle.`)
                targetClipName = 'Idle'
            }
        }

        const newAction = actions[targetClipName]

        // Crossfade logic
        if (newAction && newAction !== currentAction) {
            // Fade out the previous action
            if (currentAction) {
                currentAction.fadeOut(0.3)
            }

            // Play the new action
            newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.3).play()

            // If it's a sign (not idle), set loop to clamp when finished (play once)
            if (targetClipName !== 'Idle') {
                newAction.setLoop(2200, 1) // THREE.LoopOnce = 2200
                newAction.clampWhenFinished = true
            }

            setCurrentAction(newAction)
        }

    }, [currentSign, isPlaying, actions])

    return (
        <group ref={group} dispose={null}>
            <primitive object={avatarScene} scale={1.8} position={[0, -1.6, 0]} />
        </group>
    )
}

// Preload model
useGLTF.preload('/avatar.glb')

export default AvatarScene
