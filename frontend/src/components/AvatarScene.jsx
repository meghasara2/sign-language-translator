/**
 * AvatarScene Component
 * 
 * 3D humanoid avatar for sign language display.
 * Uses a generic human base mesh styled to look like SignAvatars (smooth, solid color).
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, Html } from '@react-three/drei'
import * as THREE from 'three'

function AvatarScene({ currentSign, isPlaying }) {
    const group = useRef()
    const [debugBones, setDebugBones] = useState([])

    // Load the generic base mesh.
    // Note: This model is downloaded to public/avatar.glb
    // We expect a standard Mixamo-rigged character (e.g. Soldier.glb for now)
    const { scene, animations } = useGLTF('/avatar.glb')

    // Use scene directly to avoid skeletal binding issues with cloning
    // const clonedScene = useMemo(() => scene.clone(true), [scene])
    const avatarScene = scene

    // Ensure shadows are enabled for original meshes
    avatarScene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
        }
    })

    // Animation mixer and actions
    const { actions } = useAnimations(animations, group)

    // Store bone references
    const bonesRef = useRef({})

    // Find bones after scene loads
    useEffect(() => {
        const bones = {}
        avatarScene.traverse((child) => {
            if (child.isBone || child.type === 'Bone') {
                bones[child.name] = child
            }
        })
        bonesRef.current = bones
        // console.log('Loaded bones:', Object.keys(bones)) 
    }, [avatarScene, actions])

    // Manage Idle Animation State
    useEffect(() => {
        if (!actions) return

        const idleAction = Object.values(actions).find((action) =>
            action.getClip().name.toLowerCase().includes('idle')
        )

        if (idleAction) {
            if (isPlaying) {
                idleAction.fadeOut(0.5)
            } else {
                idleAction.reset().fadeIn(0.5).play()
            }
        }
    }, [actions, isPlaying])

    // Animation state
    const animationProgress = useRef(0)

    // Reset animation when sign changes
    useEffect(() => {
        animationProgress.current = 0
    }, [currentSign])

    // Procedural Animation Loop
    useFrame((state, delta) => {
        const bones = bonesRef.current
        const time = state.clock.elapsedTime

        // Helper to find bones with flexible naming
        const findBone = (names) => {
            for (const name of names) {
                if (bones[name]) return bones[name]
            }
            return null
        }

        const rightArm = findBone(['mixamorigRightArm', 'RightArm', 'RightUpperArm', 'Arm_R'])
        const rightForeArm = findBone(['mixamorigRightForeArm', 'RightForeArm', 'RightLowerArm', 'ForeArm_R'])
        const leftArm = findBone(['mixamorigLeftArm', 'LeftArm', 'LeftUpperArm', 'Arm_L'])
        const leftForeArm = findBone(['mixamorigLeftForeArm', 'LeftForeArm', 'LeftLowerArm', 'ForeArm_L'])
        const spine = findBone(['mixamorigSpine', 'Spine', 'Spine1'])
        const head = findBone(['mixamorigHead', 'Head', 'HeadTop_End'])

        // Procedural Sign Animations (blended on top of idle)
        if (isPlaying && currentSign) {
            animationProgress.current = Math.min(animationProgress.current + delta * 3, 1) // Smooth transition

            // Move arms based on sign
            switch (currentSign) {
                case 'HELLO':
                case 'HI':
                    if (rightArm) {
                        rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -1.8, 0.1)
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -0.2, 0.1)
                    }
                    if (rightForeArm) {
                        rightForeArm.rotation.z = -1.5 + Math.sin(time * 10) * 0.5
                        rightForeArm.rotation.x = -0.5
                    }
                    break

                case 'HOW':
                    // Both hands curve up
                    if (rightArm) rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.5, 0.1)
                    if (leftArm) leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.5, 0.1)
                    if (rightForeArm) rightForeArm.rotation.x = -1.5
                    if (leftForeArm) leftForeArm.rotation.x = -1.5
                    break

                case 'WHERE':
                case 'WHAT':
                case 'WHY':
                case 'WHO':
                    // Hands out questioning
                    if (rightArm) rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -1.0, 0.1)
                    if (leftArm) leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 1.0, 0.1)
                    if (rightForeArm) rightForeArm.rotation.x = -0.5
                    if (leftForeArm) leftForeArm.rotation.x = -0.5
                    // Head tilt
                    if (head) head.rotation.z = Math.sin(time * 2) * 0.1
                    break

                case 'YOU':
                case 'YOUR':
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.5, 0.1)
                        rightArm.rotation.z = -0.2
                    }
                    if (rightForeArm) {
                        rightForeArm.rotation.x = 0
                    }
                    break

                case 'ME':
                case 'I':
                case 'MY':
                case 'HAPPY':
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.0, 0.1)
                        rightArm.rotation.z = 0.5
                    }
                    if (rightForeArm) {
                        rightForeArm.rotation.x = 2.0 // Point to chest
                        rightForeArm.rotation.y = -0.5
                    }
                    break

                case 'YES':
                case 'GOOD':
                    // Fist bob or Thumb Up (approximated)
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.0, 0.1)
                        rightArm.rotation.z = 0.5
                    }
                    if (rightForeArm) {
                        rightForeArm.rotation.x = 0.5 + Math.sin(time * 8) * 0.3
                    }
                    if (head) head.rotation.x = Math.sin(time * 10) * 0.2 // Nod
                    break

                case 'NO':
                case 'BAD':
                case 'SAD':
                    // Hand shake / Head shake
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.2, 0.1)
                        rightArm.rotation.z = 0.5 + Math.sin(time * 10) * 0.2
                    }
                    if (head) head.rotation.y = Math.sin(time * 10) * 0.3 // Shake
                    break

                case 'THANK_YOU':
                case 'THANK-YOU':
                case 'THANKS':
                    // Hand from chin (approx) out
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -0.8, 0.1)
                        rightArm.rotation.z = 0.3
                    }
                    if (rightForeArm) {
                        const wave = Math.sin(time * 3) * 0.5 + 0.5
                        rightForeArm.rotation.x = THREE.MathUtils.lerp(1.5, 0.2, wave)
                    }
                    break

                case 'NICE':
                case 'MEET':
                    // Hands together
                    if (rightArm) rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.5, 0.1)
                    if (leftArm) leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.5, 0.1)
                    if (rightForeArm) rightForeArm.rotation.y = -1.0
                    if (leftForeArm) leftForeArm.rotation.y = 1.0
                    break

                case 'NAME':
                case 'PLEASE':
                case 'HELP':
                    // Flat hand on chest / circular
                    if (rightArm) {
                        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.2, 0.1)
                        rightArm.rotation.z = 0.8
                    }
                    if (rightForeArm) {
                        rightForeArm.rotation.x = 1.8 + Math.sin(time * 5) * 0.2
                    }
                    break

                default:
                    // Generic gesture (shrug or point)
                    if (rightArm) rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.8, 0.1)
                    if (leftArm) leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.8, 0.1)
                    if (rightForeArm) rightForeArm.rotation.x = -0.5
                    if (leftForeArm) leftForeArm.rotation.x = -0.5
                    if (head) head.rotation.z = Math.sin(time * 2) * 0.05 // Confused tilt
            }
        }
    })

    return (
        <group ref={group} dispose={null}>
            <primitive object={avatarScene} scale={1.8} position={[0, -1.6, 0]} />
        </group>
    )
}

// Preload model
useGLTF.preload('/avatar.glb')

export default AvatarScene
