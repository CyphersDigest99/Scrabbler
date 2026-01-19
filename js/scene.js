import * as THREE from 'three';

/**
 * Three.js Scene Manager
 * Sets up the 3D scene, camera, lighting, and renderer for the letter wheel
 */
export class SceneManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.envMap = null;

        this.init();
    }

    init() {
        // Create scene with transparent background
        this.scene = new THREE.Scene();
        this.scene.background = null;

        // Set up camera - positioned to view horizontal drums through window
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(0, 0, 13);
        this.camera.lookAt(0, 0, 0);

        // Set up renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Set up lighting for metallic surfaces
        this.setupLighting();

        // Create environment map for reflections
        this.createEnvMap();

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // Handle orientation change (mobile)
        window.addEventListener('orientationchange', () => {
            // Delay to let the browser finish orientation change
            setTimeout(() => this.onResize(), 100);
        });

        // ResizeObserver for reliable canvas size detection
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.onResize();
            });
            this.resizeObserver.observe(this.canvas);
        }
    }

    setupLighting() {
        // Ambient light - subtle base illumination
        const ambientLight = new THREE.AmbientLight(0xf5e6c8, 0.3);
        this.scene.add(ambientLight);

        // Main directional light - from above-front
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
        mainLight.position.set(2, 5, 10);
        this.scene.add(mainLight);

        // Fill light - softer, from the side
        const fillLight = new THREE.DirectionalLight(0xb5a642, 0.5);
        fillLight.position.set(-5, 2, 5);
        this.scene.add(fillLight);

        // Rim light - from behind for edge definition
        const rimLight = new THREE.DirectionalLight(0xffd700, 0.3);
        rimLight.position.set(0, -2, -5);
        this.scene.add(rimLight);

        // Point light for brass glow effect
        const glowLight = new THREE.PointLight(0xd4c575, 0.4, 30);
        glowLight.position.set(0, 0, 8);
        this.scene.add(glowLight);
    }

    createEnvMap() {
        // Create a simple cubemap for metallic reflections
        // Using gradient colors to simulate a brass workshop environment
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
        const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);

        // Create a simple environment scene
        const envScene = new THREE.Scene();

        // Warm ceiling
        const ceilingGeo = new THREE.PlaneGeometry(100, 100);
        const ceilingMat = new THREE.MeshBasicMaterial({ color: 0xd4c575, side: THREE.DoubleSide });
        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
        ceiling.position.y = 20;
        ceiling.rotation.x = Math.PI / 2;
        envScene.add(ceiling);

        // Dark floor
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1510, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(ceilingGeo.clone(), floorMat);
        floor.position.y = -20;
        floor.rotation.x = -Math.PI / 2;
        envScene.add(floor);

        // Warm walls
        const wallMat = new THREE.MeshBasicMaterial({ color: 0x8b7d3a, side: THREE.DoubleSide });
        for (let i = 0; i < 4; i++) {
            const wall = new THREE.Mesh(ceilingGeo.clone(), wallMat);
            wall.position.set(
                Math.cos(i * Math.PI / 2) * 30,
                0,
                Math.sin(i * Math.PI / 2) * 30
            );
            wall.rotation.y = i * Math.PI / 2;
            envScene.add(wall);
        }

        // Render the environment map
        cubeCamera.update(this.renderer, envScene);
        this.envMap = cubeRenderTarget.texture;

        // Clean up
        ceilingGeo.dispose();
        ceilingMat.dispose();
        floorMat.dispose();
        wallMat.dispose();
    }

    onResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        // Prevent issues with 0 dimensions during transitions
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    getEnvMap() {
        return this.envMap;
    }
}
