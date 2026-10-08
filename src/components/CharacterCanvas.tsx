import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CharacterGender, OutfitColor } from '../types';

interface CharacterCanvasProps {
  gender?: CharacterGender;
  outfitColor?: OutfitColor;
  isWalking?: boolean;
  gamePage?: 'welcome' | 'playing';
  onCharacterClick?: () => void;
}

export const CharacterCanvas: React.FC<CharacterCanvasProps> = ({
  gender = 'male',
  outfitColor = 'charcoal',
  isWalking = false,
  gamePage = 'welcome',
  onCharacterClick,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const manualRotationRef = useRef<number>(0);
  const targetManualRotationRef = useRef<number>(0);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Group references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const maleGroupRef = useRef<THREE.Group | null>(null);
  const femaleGroupRef = useRef<THREE.Group | null>(null);
  const characterRootRef = useRef<THREE.Group | null>(null);

  // Procedural male limbs for walking & idle animations
  const maleLimbsRef = useRef<{
    maleLeftArm?: THREE.Group;
    maleRightArm?: THREE.Group;
    maleLeftLeg?: THREE.Group;
    maleRightLeg?: THREE.Group;
    maleHead?: THREE.Group;
    malePelvis?: THREE.Group;
    malePufferMeshes: THREE.Mesh[];
    maleCargoMeshes: THREE.Mesh[];
  }>({
    malePufferMeshes: [],
    maleCargoMeshes: [],
  });

  // Procedural female limbs for walking animations
  const femaleLimbsRef = useRef<{
    femaleLeftArm?: THREE.Group;
    femaleRightArm?: THREE.Group;
    femaleLeftLeg?: THREE.Group;
    femaleRightLeg?: THREE.Group;
    femaleHead?: THREE.Group;
    femalePelvis?: THREE.Group;
    femaleJacketMeshes: THREE.Mesh[];
    femaleCargoMeshes: THREE.Mesh[];
  }>({
    femaleJacketMeshes: [],
    femaleCargoMeshes: [],
  });

  // 1. Scene, Camera, Renderer & Procedural 3D Avatars
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 450;
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 1.1, 4.3);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    // Studio Lighting (Crisp key, ambient fill, and emerald nature rim)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.3);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 1.2);
    fillLight.position.set(-4, 3, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xa7f3d0, 2.2);
    rimLight.position.set(0, 4, -4);
    scene.add(rimLight);

    // Ground Contact Shadow Disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(128, 128, 10, 128, 128, 120);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.6)');
    grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.22)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -1.05;
    scene.add(shadowMesh);

    // Main Root Group
    const characterRoot = new THREE.Group();
    characterRoot.position.set(0, -1.05, 0);
    scene.add(characterRoot);
    characterRootRef.current = characterRoot;

    // Palette helper for initial materials
    const getPaletteColors = (col: OutfitColor) => {
      switch (col) {
        case 'forest':
          return { jacket: 0x1b4332, cargo: 0x2d4a3e, accent: 0x52b788 };
        case 'sand':
          return { jacket: 0x926c48, cargo: 0x57412f, accent: 0xd4a373 };
        case 'charcoal':
        default:
          return { jacket: 0x27272a, cargo: 0x18181b, accent: 0x10b981 };
      }
    };
    const initPalette = getPaletteColors(outfitColor);

    // =========================================================================
    // 1. BUILD STREETWEAR MALE EXPLORER AVATAR (Nicolas Martins Inspired)
    // Features: Oversized puffer jacket baffles, streetwear beanie, high collar,
    // baggy cargo trousers with tactical flap pockets, chunky trail sneakers
    // =========================================================================
    const maleGroup = new THREE.Group();
    characterRoot.add(maleGroup);
    maleGroupRef.current = maleGroup;

    // Materials
    const skinMatMale = new THREE.MeshStandardMaterial({
      color: 0xedd6c8,
      roughness: 0.6,
      metalness: 0.05,
    });

    const mPufferMat = new THREE.MeshStandardMaterial({
      color: initPalette.jacket,
      roughness: 0.45,
      metalness: 0.15,
    });

    const mCargoMat = new THREE.MeshStandardMaterial({
      color: initPalette.cargo,
      roughness: 0.7,
      metalness: 0.08,
    });

    const mBeanieMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
    });

    const mAccentMat = new THREE.MeshStandardMaterial({
      color: 0x10b981, // Neon emerald technical pull tab / zipper
      roughness: 0.3,
      metalness: 0.2,
    });

    const mSneakerMat = new THREE.MeshStandardMaterial({
      color: 0xe4e4e7,
      roughness: 0.4,
      metalness: 0.15,
    });

    const mSneakerSoleMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.9,
    });

    // Male Pelvis Group
    const mPelvisGroup = new THREE.Group();
    mPelvisGroup.position.y = 1.15;
    maleGroup.add(mPelvisGroup);
    maleLimbsRef.current.malePelvis = mPelvisGroup;

    // Male Torso Group
    const mTorsoGroup = new THREE.Group();
    mPelvisGroup.add(mTorsoGroup);

    // Nicolas Martins Oversized Puffer Jacket (Segmented Quilted Baffles)
    // Baffle 1 (Lower Torso)
    const mBaffleLower = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.37, 0.22, 24), mPufferMat);
    mBaffleLower.position.y = 0.16;
    mBaffleLower.castShadow = true;
    mTorsoGroup.add(mBaffleLower);
    maleLimbsRef.current.malePufferMeshes.push(mBaffleLower);

    // Baffle 2 (Mid Torso)
    const mBaffleMid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.22, 24), mPufferMat);
    mBaffleMid.position.y = 0.35;
    mBaffleMid.castShadow = true;
    mTorsoGroup.add(mBaffleMid);
    maleLimbsRef.current.malePufferMeshes.push(mBaffleMid);

    // Baffle 3 (Upper Chest / Shoulders)
    const mBaffleUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.43, 0.22, 24), mPufferMat);
    mBaffleUpper.position.y = 0.54;
    mBaffleUpper.castShadow = true;
    mTorsoGroup.add(mBaffleUpper);
    maleLimbsRef.current.malePufferMeshes.push(mBaffleUpper);

    // Vertical Storm Zipper & Chest Accent
    const mZipper = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.62, 0.04), mAccentMat);
    mZipper.position.set(0, 0.35, 0.41);
    mTorsoGroup.add(mZipper);

    // Puffer High Insulated Storm Collar
    const mPufferCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.18, 20), mPufferMat);
    mPufferCollar.position.y = 0.72;
    mTorsoGroup.add(mPufferCollar);
    maleLimbsRef.current.malePufferMeshes.push(mPufferCollar);

    // Crossbody Technical Sling Harness / Chest Rig
    const mChestRig = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.8 }));
    mChestRig.position.set(0.1, 0.42, 0.43);
    mTorsoGroup.add(mChestRig);

    const mChestRigStrap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.02), new THREE.MeshStandardMaterial({ color: 0x18181b }));
    mChestRigStrap.position.set(-0.06, 0.48, 0.41);
    mChestRigStrap.rotation.z = -0.55;
    mTorsoGroup.add(mChestRigStrap);

    // Male Head Group
    const mHeadGroup = new THREE.Group();
    mHeadGroup.position.y = 0.96;
    mTorsoGroup.add(mHeadGroup);
    maleLimbsRef.current.maleHead = mHeadGroup;

    // Face / Head
    const mFace = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 20), skinMatMale);
    mHeadGroup.add(mFace);

    // Streetwear Watch-Cap Beanie (Turned-up cuff + dome)
    const mBeanieDome = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 16), mBeanieMat);
    mBeanieDome.position.set(0, 0.06, -0.02);
    mHeadGroup.add(mBeanieDome);

    const mBeanieCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 20), mBeanieMat);
    mBeanieCuff.position.set(0, 0.05, -0.01);
    mHeadGroup.add(mBeanieCuff);

    // Sleek Streetwear Sunglasses / Dark Visor (Nic0 Martins aesthetic)
    const mShades = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.1, metalness: 0.9 })
    );
    mShades.position.set(0, 0.02, 0.17);
    mHeadGroup.add(mShades);

    // Male Arms (Puffer Sleeves)
    // Left Arm
    const mLArmGroup = new THREE.Group();
    mLArmGroup.position.set(-0.48, 0.58, 0);
    mTorsoGroup.add(mLArmGroup);
    maleLimbsRef.current.maleLeftArm = mLArmGroup;

    const mLArmBaffle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.3, 16), mPufferMat);
    mLArmBaffle1.position.y = -0.15;
    mLArmBaffle1.castShadow = true;
    mLArmGroup.add(mLArmBaffle1);
    maleLimbsRef.current.malePufferMeshes.push(mLArmBaffle1);

    const mLArmBaffle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.3, 16), mPufferMat);
    mLArmBaffle2.position.y = -0.42;
    mLArmBaffle2.castShadow = true;
    mLArmGroup.add(mLArmBaffle2);
    maleLimbsRef.current.malePufferMeshes.push(mLArmBaffle2);

    const mLHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.08), skinMatMale);
    mLHand.position.y = -0.68;
    mLArmGroup.add(mLHand);

    // Right Arm
    const mRArmGroup = new THREE.Group();
    mRArmGroup.position.set(0.48, 0.58, 0);
    mTorsoGroup.add(mRArmGroup);
    maleLimbsRef.current.maleRightArm = mRArmGroup;

    const mRArmBaffle1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.3, 16), mPufferMat);
    mRArmBaffle1.position.y = -0.15;
    mRArmBaffle1.castShadow = true;
    mRArmGroup.add(mRArmBaffle1);
    maleLimbsRef.current.malePufferMeshes.push(mRArmBaffle1);

    const mRArmBaffle2 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.3, 16), mPufferMat);
    mRArmBaffle2.position.y = -0.42;
    mRArmBaffle2.castShadow = true;
    mRArmGroup.add(mRArmBaffle2);
    maleLimbsRef.current.malePufferMeshes.push(mRArmBaffle2);

    const mRHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.08), skinMatMale);
    mRHand.position.y = -0.68;
    mRArmGroup.add(mRHand);

    // Male Utility Cargo Pants
    const mWaist = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.39, 0.22, 20), mCargoMat);
    mWaist.position.y = 0.02;
    mPelvisGroup.add(mWaist);
    maleLimbsRef.current.maleCargoMeshes.push(mWaist);

    // Left Cargo Leg
    const mLLegGroup = new THREE.Group();
    mLLegGroup.position.set(-0.21, 0.05, 0);
    mPelvisGroup.add(mLLegGroup);
    maleLimbsRef.current.maleLeftLeg = mLLegGroup;

    const mLLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.44, 16), mCargoMat);
    mLLegUpper.position.y = -0.22;
    mLLegUpper.castShadow = true;
    mLLegGroup.add(mLLegUpper);
    maleLimbsRef.current.maleCargoMeshes.push(mLLegUpper);

    // 3D Cargo Flap Pocket on left thigh
    const mLPocket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.16), mCargoMat);
    mLPocket.position.set(-0.16, -0.22, 0.02);
    mLLegGroup.add(mLPocket);
    maleLimbsRef.current.maleCargoMeshes.push(mLPocket);

    const mLLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.38, 16), mCargoMat);
    mLLegLower.position.y = -0.54;
    mLLegGroup.add(mLLegLower);
    maleLimbsRef.current.maleCargoMeshes.push(mLLegLower);

    // Chunky High-Top Trail Sneaker (Left)
    const mLShoe = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.18, 0.42), mSneakerMat);
    mLShoe.position.set(0, -0.81, 0.05);
    mLShoe.castShadow = true;
    mLLegGroup.add(mLShoe);

    const mLSole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.45), mSneakerSoleMat);
    mLSole.position.set(0, -0.91, 0.05);
    mLLegGroup.add(mLSole);

    // Right Cargo Leg
    const mRLegGroup = new THREE.Group();
    mRLegGroup.position.set(0.21, 0.05, 0);
    mPelvisGroup.add(mRLegGroup);
    maleLimbsRef.current.maleRightLeg = mRLegGroup;

    const mRLegUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.44, 16), mCargoMat);
    mRLegUpper.position.y = -0.22;
    mRLegUpper.castShadow = true;
    mRLegGroup.add(mRLegUpper);
    maleLimbsRef.current.maleCargoMeshes.push(mRLegUpper);

    // 3D Cargo Flap Pocket on right thigh
    const mRPocket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.16), mCargoMat);
    mRPocket.position.set(0.16, -0.22, 0.02);
    mRLegGroup.add(mRPocket);
    maleLimbsRef.current.maleCargoMeshes.push(mRPocket);

    const mRLegLower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.38, 16), mCargoMat);
    mRLegLower.position.y = -0.54;
    mRLegGroup.add(mRLegLower);
    maleLimbsRef.current.maleCargoMeshes.push(mRLegLower);

    // Chunky High-Top Trail Sneaker (Right)
    const mRShoe = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.18, 0.42), mSneakerMat);
    mRShoe.position.set(0, -0.81, 0.05);
    mRShoe.castShadow = true;
    mRLegGroup.add(mRShoe);

    const mRSole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.45), mSneakerSoleMat);
    mRSole.position.set(0, -0.91, 0.05);
    mRLegGroup.add(mRSole);


    // =========================================================================
    // 2. BUILD HIGH-FIDELITY FEMALE EXPLORER AVATAR
    // Features: Athletic technical windbreaker jacket, pony-tail hair, utility cargo shorts,
    // calf socks, trail sneakers
    // =========================================================================
    const femaleGroup = new THREE.Group();
    characterRoot.add(femaleGroup);
    femaleGroupRef.current = femaleGroup;

    const skinMatFemale = new THREE.MeshStandardMaterial({
      color: 0xebd3c0,
      roughness: 0.55,
      metalness: 0.05,
    });

    const hairMatFemale = new THREE.MeshStandardMaterial({
      color: 0x2e1d13,
      roughness: 0.7,
    });

    const fJacketMat = new THREE.MeshStandardMaterial({
      color: initPalette.jacket,
      roughness: 0.45,
      metalness: 0.15,
    });

    const fCargoMat = new THREE.MeshStandardMaterial({
      color: initPalette.cargo,
      roughness: 0.65,
      metalness: 0.1,
    });

    const socksMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5,
      roughness: 0.8,
    });

    const sneakerMainMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.5,
      metalness: 0.2,
    });

    const sneakerSoleMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.9,
    });

    // Female Pelvis & Body
    const fPelvisGroup = new THREE.Group();
    fPelvisGroup.position.y = 1.15;
    femaleGroup.add(fPelvisGroup);
    femaleLimbsRef.current.femalePelvis = fPelvisGroup;

    const fTorsoGroup = new THREE.Group();
    fPelvisGroup.add(fTorsoGroup);

    const fJacketMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.58, 22), fJacketMat);
    fJacketMesh.position.y = 0.35;
    fJacketMesh.castShadow = true;
    fTorsoGroup.add(fJacketMesh);
    femaleLimbsRef.current.femaleJacketMeshes.push(fJacketMesh);

    const fInnerCrop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.33, 0.12, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
    );
    fInnerCrop.position.y = 0.06;
    fTorsoGroup.add(fInnerCrop);

    const fCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.23, 0.14, 18),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    fCollar.position.y = 0.69;
    fTorsoGroup.add(fCollar);

    const fNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 14), skinMatFemale);
    fNeck.position.y = 0.78;
    fTorsoGroup.add(fNeck);

    const fHeadGroup = new THREE.Group();
    fHeadGroup.position.y = 0.96;
    fTorsoGroup.add(fHeadGroup);
    femaleLimbsRef.current.femaleHead = fHeadGroup;

    const fFace = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), skinMatFemale);
    fHeadGroup.add(fFace);

    const fHair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), hairMatFemale);
    fHair.position.set(0, 0.04, -0.04);
    fHeadGroup.add(fHair);

    const fPonytail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 12), hairMatFemale);
    fPonytail.position.set(0, 0.02, -0.22);
    fPonytail.rotation.x = -Math.PI / 3;
    fHeadGroup.add(fPonytail);

    // Female Arms
    const fLArmGroup = new THREE.Group();
    fLArmGroup.position.set(-0.4, 0.55, 0);
    fTorsoGroup.add(fLArmGroup);
    femaleLimbsRef.current.femaleLeftArm = fLArmGroup;

    const fLArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.6, 14), fJacketMat);
    fLArmMesh.position.y = -0.3;
    fLArmMesh.castShadow = true;
    fLArmGroup.add(fLArmMesh);
    femaleLimbsRef.current.femaleJacketMeshes.push(fLArmMesh);

    const fLHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.07), skinMatFemale);
    fLHand.position.y = -0.64;
    fLArmGroup.add(fLHand);

    const fRArmGroup = new THREE.Group();
    fRArmGroup.position.set(0.4, 0.55, 0);
    fTorsoGroup.add(fRArmGroup);
    femaleLimbsRef.current.femaleRightArm = fRArmGroup;

    const fRArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.6, 14), fJacketMat);
    fRArmMesh.position.y = -0.3;
    fRArmMesh.castShadow = true;
    fRArmGroup.add(fRArmMesh);
    femaleLimbsRef.current.femaleJacketMeshes.push(fRArmMesh);

    const fRHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.07), skinMatFemale);
    fRHand.position.y = -0.64;
    fRArmGroup.add(fRHand);

    // Female Cargo Shorts
    const fShorts = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.32, 18), fCargoMat);
    fShorts.position.y = 0.05;
    fPelvisGroup.add(fShorts);
    femaleLimbsRef.current.femaleCargoMeshes.push(fShorts);

    // Female Legs
    const fLLegGroup = new THREE.Group();
    fLLegGroup.position.set(-0.19, 0.05, 0);
    fPelvisGroup.add(fLLegGroup);
    femaleLimbsRef.current.femaleLeftLeg = fLLegGroup;

    const fLLegShort = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.38, 16), fCargoMat);
    fLLegShort.position.y = -0.16;
    fLLegGroup.add(fLLegShort);
    femaleLimbsRef.current.femaleCargoMeshes.push(fLLegShort);

    const fLLegCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.38, 12), skinMatFemale);
    fLLegCalf.position.y = -0.48;
    fLLegGroup.add(fLLegCalf);

    const fLSock = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 12), socksMat);
    fLSock.position.y = -0.68;
    fLLegGroup.add(fLSock);

    const fLShoe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.16, 0.4), sneakerMainMat);
    fLShoe.position.set(0, -0.82, 0.04);
    fLShoe.castShadow = true;
    fLLegGroup.add(fLShoe);

    const fLSole = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.07, 0.43), sneakerSoleMat);
    fLSole.position.set(0, -0.91, 0.04);
    fLLegGroup.add(fLSole);

    // Right leg
    const fRLegGroup = new THREE.Group();
    fRLegGroup.position.set(0.19, 0.05, 0);
    fPelvisGroup.add(fRLegGroup);
    femaleLimbsRef.current.femaleRightLeg = fRLegGroup;

    const fRLegShort = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.38, 16), fCargoMat);
    fRLegShort.position.y = -0.16;
    fRLegGroup.add(fRLegShort);
    femaleLimbsRef.current.femaleCargoMeshes.push(fRLegShort);

    const fRLegCalf = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.38, 12), skinMatFemale);
    fRLegCalf.position.y = -0.48;
    fRLegGroup.add(fRLegCalf);

    const fRSock = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 12), socksMat);
    fRSock.position.y = -0.68;
    fRLegGroup.add(fRSock);

    const fRShoe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.16, 0.4), sneakerMainMat);
    fRShoe.position.set(0, -0.82, 0.04);
    fRShoe.castShadow = true;
    fRLegGroup.add(fRShoe);

    const fRSole = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.07, 0.43), sneakerSoleMat);
    fRSole.position.set(0, -0.91, 0.04);
    fRLegGroup.add(fRSole);

    // Set initial visibility based on gender prop
    maleGroup.visible = gender === 'male';
    femaleGroup.visible = gender === 'female';

    // Mouse Parallax & Resize
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mousePosRef.current = { x, y };
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 400;
      const newH = container.clientHeight || 450;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth manual drag orbit
      manualRotationRef.current = THREE.MathUtils.lerp(
        manualRotationRef.current,
        targetManualRotationRef.current,
        0.08
      );

      // Character Base Rotation
      const baseRotation = -0.12 + manualRotationRef.current;
      characterRoot.rotation.y = baseRotation;

      // 1. Male Streetwear procedural animation (Breathing & Walk Cycle)
      if (maleGroup.visible) {
        const breath = Math.sin(elapsedTime * 2.2) * 0.012;
        mPelvisGroup.position.y = 1.15 + breath;

        if (isWalking) {
          const walkCycle = Math.sin(elapsedTime * 6.0);
          if (maleLimbsRef.current.maleLeftLeg) maleLimbsRef.current.maleLeftLeg.rotation.x = walkCycle * 0.55;
          if (maleLimbsRef.current.maleRightLeg) maleLimbsRef.current.maleRightLeg.rotation.x = -walkCycle * 0.55;
          if (maleLimbsRef.current.maleLeftArm) maleLimbsRef.current.maleLeftArm.rotation.x = -walkCycle * 0.45;
          if (maleLimbsRef.current.maleRightArm) maleLimbsRef.current.maleRightArm.rotation.x = walkCycle * 0.45;
        } else {
          const idleArmSway = Math.sin(elapsedTime * 2.0) * 0.03;
          if (maleLimbsRef.current.maleLeftLeg) maleLimbsRef.current.maleLeftLeg.rotation.x = 0;
          if (maleLimbsRef.current.maleRightLeg) maleLimbsRef.current.maleRightLeg.rotation.x = 0;
          if (maleLimbsRef.current.maleLeftArm) {
            maleLimbsRef.current.maleLeftArm.rotation.x = 0.06 + idleArmSway;
            maleLimbsRef.current.maleLeftArm.rotation.z = 0.16;
          }
          if (maleLimbsRef.current.maleRightArm) {
            maleLimbsRef.current.maleRightArm.rotation.x = 0.06 - idleArmSway;
            maleLimbsRef.current.maleRightArm.rotation.z = -0.16;
          }
        }
      }

      // 2. Female procedural animation (Breathing & Walk Cycle)
      if (femaleGroup.visible) {
        const breath = Math.sin(elapsedTime * 2.2) * 0.012;
        fPelvisGroup.position.y = 1.15 + breath;

        if (isWalking) {
          const walkCycle = Math.sin(elapsedTime * 6.0);
          if (femaleLimbsRef.current.femaleLeftLeg) femaleLimbsRef.current.femaleLeftLeg.rotation.x = walkCycle * 0.55;
          if (femaleLimbsRef.current.femaleRightLeg) femaleLimbsRef.current.femaleRightLeg.rotation.x = -walkCycle * 0.55;
          if (femaleLimbsRef.current.femaleLeftArm) femaleLimbsRef.current.femaleLeftArm.rotation.x = -walkCycle * 0.45;
          if (femaleLimbsRef.current.femaleRightArm) femaleLimbsRef.current.femaleRightArm.rotation.x = walkCycle * 0.45;
        } else {
          const idleArmSway = Math.sin(elapsedTime * 2.0) * 0.03;
          if (femaleLimbsRef.current.femaleLeftLeg) femaleLimbsRef.current.femaleLeftLeg.rotation.x = 0;
          if (femaleLimbsRef.current.femaleRightLeg) femaleLimbsRef.current.femaleRightLeg.rotation.x = 0;
          if (femaleLimbsRef.current.femaleLeftArm) {
            femaleLimbsRef.current.femaleLeftArm.rotation.x = 0.06 + idleArmSway;
            femaleLimbsRef.current.femaleLeftArm.rotation.z = 0.18;
          }
          if (femaleLimbsRef.current.femaleRightArm) {
            femaleLimbsRef.current.femaleRightArm.rotation.x = 0.06 - idleArmSway;
            femaleLimbsRef.current.femaleRightArm.rotation.z = -0.18;
          }
        }
      }

      // Camera Centering & Framing: Responsive distance for mobile & tablet
      const isNarrow = container.clientWidth < 640;
      const isTablet = container.clientWidth < 1024;
      const baseZ = isNarrow ? 4.55 : isTablet ? 4.3 : 4.15;
      const targetZ = gamePage === 'playing' ? 3.9 : baseZ;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.05, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.08);
      camera.lookAt(0, 0.88, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [gamePage]);

  // Sync Gender Switching
  useEffect(() => {
    if (maleGroupRef.current && femaleGroupRef.current) {
      maleGroupRef.current.visible = gender === 'male';
      femaleGroupRef.current.visible = gender === 'female';
    }
  }, [gender]);

  // Sync Outfit Color Tint across both avatars
  useEffect(() => {
    let jacketHex = 0x27272a;
    let cargoHex = 0x18181b;

    if (outfitColor === 'forest') {
      jacketHex = 0x1b4332;
      cargoHex = 0x2d4a3e;
    } else if (outfitColor === 'sand') {
      jacketHex = 0x926c48;
      cargoHex = 0x57412f;
    }

    // Update Male Puffer & Cargo meshes
    maleLimbsRef.current.malePufferMeshes.forEach((mesh) => {
      if (mesh.material && (mesh.material as any).color) {
        (mesh.material as any).color.setHex(jacketHex);
      }
    });
    maleLimbsRef.current.maleCargoMeshes.forEach((mesh) => {
      if (mesh.material && (mesh.material as any).color) {
        (mesh.material as any).color.setHex(cargoHex);
      }
    });

    // Update Female Jacket & Cargo meshes
    femaleLimbsRef.current.femaleJacketMeshes.forEach((mesh) => {
      if (mesh.material && (mesh.material as any).color) {
        (mesh.material as any).color.setHex(jacketHex);
      }
    });
    femaleLimbsRef.current.femaleCargoMeshes.forEach((mesh) => {
      if (mesh.material && (mesh.material as any).color) {
        (mesh.material as any).color.setHex(cargoHex);
      }
    });
  }, [outfitColor]);

  // Pointer Drag to Orbit 360° with touch support and pointer capture
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    targetManualRotationRef.current += deltaX * 0.012;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  // Quick rotation buttons
  const rotateLeft = () => {
    targetManualRotationRef.current -= Math.PI / 4;
  };
  const rotateRight = () => {
    targetManualRotationRef.current += Math.PI / 4;
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* 3D WebGL Canvas with touch-none for flawless touch drag */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={onCharacterClick}
      />

      {/* Quick Rotate Touch Pills */}
      <div className="absolute bottom-2.5 flex items-center gap-2 z-20">
        <button
          onClick={rotateLeft}
          title="Rotate Left"
          type="button"
          className="p-1.5 px-2 rounded-lg bg-stone-900/80 hover:bg-stone-900 text-stone-200 hover:text-white border border-stone-700/60 shadow-sm text-xs font-mono transition-transform active:scale-95 cursor-pointer backdrop-blur-xs flex items-center gap-1"
        >
          <span>⟲</span>
          <span className="text-[10px] hidden sm:inline">-45°</span>
        </button>

        <div className="pointer-events-none flex items-center gap-1.5 px-2.5 py-1 bg-stone-900/80 backdrop-blur-xs rounded-lg border border-stone-700/60 text-[10px] sm:text-[11px] font-mono text-stone-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>DRAG 360°</span>
        </div>

        <button
          onClick={rotateRight}
          title="Rotate Right"
          type="button"
          className="p-1.5 px-2 rounded-lg bg-stone-900/80 hover:bg-stone-900 text-stone-200 hover:text-white border border-stone-700/60 shadow-sm text-xs font-mono transition-transform active:scale-95 cursor-pointer backdrop-blur-xs flex items-center gap-1"
        >
          <span className="text-[10px] hidden sm:inline">+45°</span>
          <span>⟳</span>
        </button>
      </div>
    </div>
  );
};
