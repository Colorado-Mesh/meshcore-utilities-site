// Web Crypto API Ed25519 implementation
console.log('✓ Web Crypto API available:', typeof crypto !== 'undefined');
console.log('✓ Subtle crypto available:', typeof crypto.subtle !== 'undefined');

// Import noble-ed25519 for proper Ed25519 operations
// This library provides the crypto_scalarmult_ed25519_base_noclamp equivalent
let nobleEd25519 = null;
let libraryUrl = null;

class MeshCoreKeyGenerator {
    constructor() {
        this.isRunning = false;
        this.attempts = 0;
        this.startTime = null;
        this.lastUpdateTime = null;
        this.updateProgressInterval = null;
        this.updateEstimateInterval = null;
        this.initialized = false;
        this.workers = [];
        this.numWorkers = navigator.hardwareConcurrency || 4; // Use all available CPU cores
        this.batchSize = Math.max(128, (navigator.hardwareConcurrency || 4) * 32); // Scale batch size with CPU cores
    }

    async initialize() {
        if (!this.initialized) {
            await this.loadNobleEd25519();

            // Initialize Web Workers for parallel CPU processing
            // Will use this.libraryUrl, set by loadNobleEd25519
            await this.initializeWorkers();
        }
    }

    // Load noble-ed25519 library with cascading fallbacks
    async loadNobleEd25519() {
        if (nobleEd25519) return nobleEd25519;

        const fallbackUrl = "noble-ed25519-key-generator-offline.js"

        const sources = [
            'https://unpkg.com/noble-ed25519@latest',
            'https://cdn.jsdelivr.net/npm/noble-ed25519@latest',
            'https://esm.sh/noble-ed25519@latest',
            'https://cdn.skypack.dev/noble-ed25519',
            './' + fallbackUrl,
        ];

        for (const src of sources) {
            try {
                nobleEd25519 = await import(src);
                this.libraryUrl = src;
                console.log(`✓ noble-ed25519 loaded from: ${src}`);
                console.log('Available functions:', Object.keys(nobleEd25519));
                return nobleEd25519;
            } catch (e) {
                // Silently try next source
            }
        }
        throw new Error('Failed to load Ed25519 library. Please check your internet connection and ensure ' + fallbackUrl + ' is available.');
    }

    async initializeWorkers() {
        if (this.workers.length > 0) return; // Already initialized

        // Use the same library URL that worked in the main thread
        // This avoids redundant network requests - workers will use the same CDN
        let libraryUrl = this.libraryUrl;

        // Convert relative URLs to absolute URLs for workers
        // Workers can't use relative imports from blob URLs
        if (libraryUrl.startsWith('./') || libraryUrl.startsWith('../')) {
            // Convert relative path to absolute URL
            libraryUrl = new URL(libraryUrl, window.location.href).href;
        }

        // Create worker script
        const workerScript = `
                    let nobleEd25519 = null;
                    
                    async function loadLibrary() {
                        if (nobleEd25519) return;
                        // Use the same library URL that worked in the main thread
                        // This is injected at worker creation time to avoid redundant fetches
                        const libraryUrl = ${JSON.stringify(libraryUrl)};
                        nobleEd25519 = await import(libraryUrl);
                    }
                    
                    async function generateKeypair() {
                        await loadLibrary();
                        
                        // Generate 32-byte random seed
                        const seed = crypto.getRandomValues(new Uint8Array(32));
                        
                        // Hash the seed with SHA-512
                        const digest = await crypto.subtle.digest('SHA-512', seed);
                        const digestArray = new Uint8Array(digest);
                        
                        // Clamp the scalar
                        const clamped = new Uint8Array(digestArray.slice(0, 32));
                        clamped[0] &= 248;
                        clamped[31] &= 63;
                        clamped[31] |= 64;
                        
                        // Generate public key
                        let scalarBigInt = 0n;
                        for (let i = 0; i < 32; i++) {
                            scalarBigInt += BigInt(clamped[i]) << BigInt(8 * i);
                        }
                        
                        let publicKey;
                        try {
                            publicKey = nobleEd25519.Point.BASE.multiply(scalarBigInt);
                        } catch (error) {
                            try {
                                publicKey = await nobleEd25519.getPublicKey(clamped);
                            } catch (fallbackError) {
                                publicKey = nobleEd25519.getPublicKey(clamped);
                            }
                        }
                        
                        // Convert public key to bytes
                        let publicKeyBytes;
                        if (publicKey instanceof Uint8Array) {
                            publicKeyBytes = publicKey;
                        } else if (publicKey.toRawBytes) {
                            publicKeyBytes = publicKey.toRawBytes();
                        } else if (publicKey.toBytes) {
                            publicKeyBytes = publicKey.toBytes();
                        } else if (publicKey.x !== undefined && publicKey.y !== undefined) {
                            publicKeyBytes = new Uint8Array(32);
                            const y = publicKey.y;
                            const x = publicKey.x;
                            for (let j = 0; j < 31; j++) {
                                publicKeyBytes[j] = Number((y >> BigInt(8 * j)) & 255n);
                            }
                            publicKeyBytes[31] = Number((x & 1n) << 7);
                        } else {
                            throw new Error('Unsupported public key format');
                        }
                        
                        // Create private key
                        const meshcorePrivateKey = new Uint8Array(64);
                        meshcorePrivateKey.set(clamped, 0);
                        meshcorePrivateKey.set(digestArray.slice(32, 64), 32);
                        
                        // Convert to hex
                        const toHex = (bytes) => {
                            return Array.from(bytes)
                                .map(b => b.toString(16).padStart(2, '0'))
                                .join('')
                                .toUpperCase();
                        };
                        
                        return {
                            publicKey: toHex(publicKeyBytes),
                            privateKey: toHex(meshcorePrivateKey),
                            publicKeyBytes: Array.from(publicKeyBytes),
                            privateKeyBytes: Array.from(meshcorePrivateKey)
                        };
                    }
                    
                    self.onmessage = async function(e) {
                        const { type, batchSize, targetPrefix } = e.data;
                        
                        if (type === 'generate') {
                            const results = [];
                            for (let i = 0; i < batchSize; i++) {
                                const keypair = await generateKeypair();
                                const matches = keypair.publicKey.startsWith(targetPrefix.toUpperCase());
                                results.push({ ...keypair, matches });
                            }
                            self.postMessage({ type: 'results', results });
                        }
                    };
                `;

        const blob = new Blob([workerScript], {type: 'application/javascript'});
        const workerUrl = URL.createObjectURL(blob);

        // Create workers
        for (let i = 0; i < this.numWorkers; i++) {
            const worker = new Worker(workerUrl);
            this.workers.push(worker);
        }

        console.log(`✓ Initialized ${this.numWorkers} Web Workers for parallel key generation`);
    }

    async cleanupWorkers() {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
    }

    calculateProbability(prefixLength) {
        let probability = 1 / Math.pow(16, prefixLength);
        let expectedAttempts = 1 / probability;

        return {
            probability,
            expectedAttempts
        }
    }

    estimateTimeText(prefixLength) {
        let data = this.calculateProbability(prefixLength);
        // Assume 10K keys/sec as baseline
        let rate = 10000
        let estimatedSeconds = data.expectedAttempts / rate;

        let timeText;
        if (estimatedSeconds >= 31536000) { // 1 year
            timeText = `${(estimatedSeconds / 31536000).toFixed(1)} years`;
        } else if (estimatedSeconds >= 2592000) { // 1 month
            timeText = `${(estimatedSeconds / 2592000).toFixed(1)} months`;
        } else if (estimatedSeconds >= 86400) { // 1 day
            timeText = `${(estimatedSeconds / 86400).toFixed(1)} days`;
        } else if (estimatedSeconds >= 3600) { // 1 hour
            timeText = `${(estimatedSeconds / 3600).toFixed(1)} hours`;
        } else if (estimatedSeconds >= 60) { // 1 minute
            timeText = `${(estimatedSeconds / 60).toFixed(1)} minutes`;
        } else {
            timeText = `${Math.round(estimatedSeconds)} seconds`;
        }

        return timeText;
    }

    // Generate a MeshCore-compatible Ed25519 keypair using RFC 8032 standard
    // This follows the official Ed25519 specification:
    // 1. Generate 32-byte random seed
    // 2. SHA512 hash the seed to get 64 bytes
    // 3. Clamp the first 32 bytes (scalar clamping)
    // 4. Use crypto_scalarmult_ed25519_base_noclamp to get public key
    // 5. Private key = [clamped_scalar][sha512_second_half] (RFC 8032 compliant)
    async generateMeshCoreKeypair() {
        // Ensure library is loaded
        await this.initialize();

        // Step 1: Generate 32-byte random seed
        const seed = crypto.getRandomValues(new Uint8Array(32));

        // Step 2: Hash the seed with SHA-512
        const digest = await crypto.subtle.digest('SHA-512', seed);
        const digestArray = new Uint8Array(digest);

        // Step 3: Clamp the first 32 bytes according to Ed25519 rules
        const clamped = new Uint8Array(digestArray.slice(0, 32));
        clamped[0] &= 248;  // Clear bottom 3 bits (make it divisible by 8)
        clamped[31] &= 63;  // Clear top 2 bits
        clamped[31] |= 64;  // Set bit 6 (ensure it's in the right range)

        // Step 4: Use the clamped scalar to generate the public key
        // This is equivalent to crypto_scalarmult_ed25519_base_noclamp
        // Use Point.BASE.multiply which accepts pre-clamped scalars (no double clamping)
        let publicKey;
        try {
            // Convert scalar to BigInt for Point.BASE.multiply
            let scalarBigInt = 0n;
            for (let i = 0; i < 32; i++) {
                scalarBigInt += BigInt(clamped[i]) << BigInt(8 * i);
            }
            publicKey = nobleEd25519.Point.BASE.multiply(scalarBigInt);
        } catch (error) {
            // Fallback to getPublicKey if Point.BASE.multiply fails
            try {
                publicKey = await nobleEd25519.getPublicKey(clamped);
            } catch (fallbackError) {
                publicKey = nobleEd25519.getPublicKey(clamped);
            }
        }

        // Convert public key to Uint8Array if it's not already
        let publicKeyBytes;
        if (publicKey instanceof Uint8Array) {
            publicKeyBytes = publicKey;
        } else if (publicKey.toRawBytes) {
            // Point object with toRawBytes method
            publicKeyBytes = publicKey.toRawBytes();
        } else if (publicKey.toBytes) {
            // Point object with toBytes method
            publicKeyBytes = publicKey.toBytes();
        } else if (publicKey.x !== undefined && publicKey.y !== undefined) {
            // Point object with x, y coordinates
            // Convert to compressed format (32 bytes)
            publicKeyBytes = new Uint8Array(32);
            const y = publicKey.y;
            const x = publicKey.x;

            // Copy y-coordinate (little-endian)
            for (let i = 0; i < 31; i++) {
                publicKeyBytes[i] = Number((y >> BigInt(8 * i)) & 255n);
            }
            // Set the sign bit based on x-coordinate
            publicKeyBytes[31] = Number((x & 1n) << 7);
        } else {
            console.error('Unsupported public key format:', publicKey);
            throw new Error(`Unsupported public key format from noble-ed25519: ${publicKey.constructor.name}`);
        }

        // Debug: Check public key format
        if (this.attempts <= 5) {
            console.log(`Public key type: ${typeof publicKey}, constructor: ${publicKey.constructor.name}`);
            console.log(`Public key bytes type: ${typeof publicKeyBytes}, length: ${publicKeyBytes?.length}`);
            console.log(`Public key bytes is Uint8Array: ${publicKeyBytes instanceof Uint8Array}`);
            if (publicKeyBytes instanceof Uint8Array) {
                console.log(`Public key bytes: ${Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`);
            }
        }

        // Step 5: Create 64-byte private key: [clamped_scalar][sha512_second_half]
        // This follows RFC 8032 Ed25519 standard: use second half of SHA-512(seed)
        const meshcorePrivateKey = new Uint8Array(64);
        meshcorePrivateKey.set(clamped, 0);                    // First 32 bytes: clamped scalar
        meshcorePrivateKey.set(digestArray.slice(32, 64), 32); // Second 32 bytes: SHA-512(seed)[32:64]

        return {
            publicKey: publicKeyBytes,
            privateKey: meshcorePrivateKey
        };
    }

    // Convert Uint8Array to hex string
    toHex(bytes) {
        if (!(bytes instanceof Uint8Array)) {
            console.error('toHex: bytes is not Uint8Array:', typeof bytes, bytes);
            return '';
        }
        const hex = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        return hex;
    }

    // Check if public key matches the target prefix
    checkPrefix(publicKeyHex, targetPrefix) {
        return publicKeyHex.startsWith(targetPrefix.toUpperCase());
    }

    // Validate that a generated keypair is correct (matches Python implementation)
    async validateKeypair(privateKeyHex, publicKeyHex) {
        try {
            // Ensure library is loaded
            await this.initialize();

            // Convert hex strings back to Uint8Array
            const privateKeyBytes = new Uint8Array(
                privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );

            if (privateKeyBytes.length !== 64) {
                return {valid: false, error: 'Private key must be 64 bytes'};
            }

            // Extract the clamped scalar (first 32 bytes) - this is what MeshCore actually uses
            const clampedScalar = privateKeyBytes.slice(0, 32);

            // 1. Check that the private key is not all zeros
            if (clampedScalar.every(byte => byte === 0)) {
                return {valid: false, error: 'Private key cannot be all zeros'};
            }

            // 2. Validate Ed25519 scalar clamping rules (matches Python implementation)
            if ((clampedScalar[0] & 7) !== 0) {
                return {valid: false, error: 'Private key scalar not properly clamped (bits 0-2 should be 0)'};
            }

            if ((clampedScalar[31] & 192) !== 64) {
                return {
                    valid: false,
                    error: 'Private key scalar not properly clamped (bits 6 should be 1, bits 7 should be 0)'
                };
            }

            // 3. Check public key format
            const publicKeyBytes = new Uint8Array(
                publicKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );

            if (publicKeyBytes.length !== 32) {
                return {valid: false, error: 'Public key must be 32 bytes'};
            }

            if (publicKeyBytes.every(byte => byte === 0)) {
                return {valid: false, error: 'Public key cannot be all zeros'};
            }

            // 4. CRITICAL: Verify that the private key actually generates the claimed public key
            // This matches the Python implementation's verify_key_compatibility function
            try {
                // Use Point.BASE.multiply which accepts pre-clamped scalars (no double clamping)
                let derivedPublicKey;
                try {
                    // Convert scalar to BigInt for Point.BASE.multiply
                    let scalarBigInt = 0n;
                    for (let i = 0; i < 32; i++) {
                        scalarBigInt += BigInt(clampedScalar[i]) << BigInt(8 * i);
                    }
                    derivedPublicKey = nobleEd25519.Point.BASE.multiply(scalarBigInt);
                } catch (error) {
                    // Fallback to getPublicKey if Point.BASE.multiply fails
                    try {
                        derivedPublicKey = await nobleEd25519.getPublicKey(clampedScalar);
                    } catch (fallbackError) {
                        derivedPublicKey = nobleEd25519.getPublicKey(clampedScalar);
                    }
                }

                // Convert to Uint8Array if needed
                let derivedPublicKeyBytes;
                if (derivedPublicKey instanceof Uint8Array) {
                    derivedPublicKeyBytes = derivedPublicKey;
                } else if (derivedPublicKey.toRawBytes) {
                    derivedPublicKeyBytes = derivedPublicKey.toRawBytes();
                } else if (derivedPublicKey.toBytes) {
                    derivedPublicKeyBytes = derivedPublicKey.toBytes();
                } else if (derivedPublicKey.x !== undefined && derivedPublicKey.y !== undefined) {
                    // Point object with x, y coordinates
                    // Convert to compressed format (32 bytes)
                    derivedPublicKeyBytes = new Uint8Array(32);
                    const y = derivedPublicKey.y;
                    const x = derivedPublicKey.x;

                    // Copy y-coordinate (little-endian)
                    for (let i = 0; i < 31; i++) {
                        derivedPublicKeyBytes[i] = Number((y >> BigInt(8 * i)) & 255n);
                    }
                    // Set the sign bit based on x-coordinate
                    derivedPublicKeyBytes[31] = Number((x & 1n) << 7);
                } else {
                    console.error('Unsupported derived public key format:', derivedPublicKey);
                    throw new Error(`Unsupported public key format from noble-ed25519: ${derivedPublicKey.constructor.name}`);
                }

                const derivedPublicHex = this.toHex(derivedPublicKeyBytes);

                if (derivedPublicHex !== publicKeyHex) {
                    return {
                        valid: false,
                        error: `Key verification failed: private key does not generate the claimed public key`
                    };
                }
            } catch (error) {
                return {
                    valid: false,
                    error: `Key verification failed: ${error.message}`
                };
            }

            return {valid: true};
        } catch (error) {
            return {valid: false, error: `Validation error: ${error.message}`};
        }
    }


    // Generate a batch of keypairs in parallel using Web Workers
    async generateKeypairBatch(targetPrefix) {
        if (this.workers.length === 0) {
            // Fallback to single-threaded if workers not available
            return await this.generateKeypairBatchSingle();
        }

        // Distribute work across all workers
        const keysPerWorker = Math.ceil(this.batchSize / this.workers.length);
        const promises = this.workers.map(worker => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    worker.removeEventListener('message', handler);
                    worker.removeEventListener('error', errorHandler);
                    reject(new Error('Worker timeout'));
                }, 30000); // 30 second timeout

                const handler = (e) => {
                    if (e.data.type === 'results') {
                        clearTimeout(timeout);
                        worker.removeEventListener('message', handler);
                        worker.removeEventListener('error', errorHandler);
                        resolve(e.data.results);
                    }
                };

                const errorHandler = (error) => {
                    clearTimeout(timeout);
                    worker.removeEventListener('message', handler);
                    worker.removeEventListener('error', errorHandler);
                    reject(error);
                };

                worker.addEventListener('message', handler);
                worker.addEventListener('error', errorHandler);
                worker.postMessage({
                    type: 'generate',
                    batchSize: keysPerWorker,
                    targetPrefix: targetPrefix
                });
            });
        });

        const allResults = await Promise.allSettled(promises);
        // Flatten results from successful workers, log failures
        const successfulResults = [];
        for (let i = 0; i < allResults.length; i++) {
            if (allResults[i].status === 'fulfilled') {
                successfulResults.push(...allResults[i].value);
            } else {
                console.warn(`Worker ${i} failed:`, allResults[i].reason);
            }
        }

        // If all workers failed, fall back to single-threaded
        if (successfulResults.length === 0) {
            console.warn('All workers failed, falling back to single-threaded mode');
            return await this.generateKeypairBatchSingle();
        }

        return successfulResults.map(result => ({
            publicKey: new Uint8Array(result.publicKeyBytes),
            privateKey: new Uint8Array(result.privateKeyBytes),
            publicKeyHex: result.publicKey,
            matches: result.matches
        }));
    }

    // Single-threaded fallback
    async generateKeypairBatchSingle() {
        const promises = [];
        for (let i = 0; i < this.batchSize; i++) {
            promises.push(this.generateMeshCoreKeypair());
        }
        const keypairs = await Promise.all(promises);
        // Return in same format as worker version
        return keypairs.map(kp => ({
            ...kp,
            publicKeyHex: this.toHex(kp.publicKey),
            matches: undefined // Will be checked in main loop
        }));
    }

    // Generate keys until we find a match
    async generateVanityKey(
        targetPrefix,
        blacklistPrefixes,
        progressCallback,
        progressCallbackFrequencyMs,
        estimateUpdateCallback,
        estimateCallbackFrequencyMs,
    ) {
        this.isRunning = true;
        this.attempts = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = this.startTime;
        this.currentTargetPrefix = targetPrefix; // Store for difficulty estimate updates
        this.currentTargetPrefixLength = this.currentTargetPrefix.length;
        this.blacklistPrefixes = blacklistPrefixes;
        this.progressCallback = progressCallback;  // Takes in (attempts, elapsedSeconds, rate, progress) parameters
        this.progressCallbackFrequencyMs = progressCallbackFrequencyMs;
        this.estimateUpdateCallback = estimateUpdateCallback;  // Takes in (expectedAttempts, rate, estimatedSeconds) parameters
        this.estimateCallbackFrequencyMs = estimateCallbackFrequencyMs;

        const getRate = () => {
            let now = Date.now();
            let elapsed = (now - this.startTime) / 1000;
            let rate = this.attempts / elapsed;

            return {
                elapsed: elapsed,
                rate: rate
            }
        }

        const updateProgress = () => {
            if (!this.isRunning) return;

            if (!this.progressCallback) return;

            let {elapsed, rate} = getRate();
            let {_, expectedAttempts} = this.calculateProbability(this.currentTargetPrefixLength);
            let progress = Math.min((this.attempts / expectedAttempts) * 100, 99);

            // Execute progress callback
            this.progressCallback(this.attempts, elapsed, rate, progress);
        };

        const updateEstimate = () => {
            if (!this.isRunning) return;

            if (!this.estimateUpdateCallback) return;

            // Calculate probability and expected attempts
            let {_, rate} = getRate();
            let {__, expectedAttempts} = this.calculateProbability(this.currentTargetPrefixLength);

            // Calculate estimated time (use current rate if provided, otherwise default to 10k keys/sec)
            const estimatedSeconds = expectedAttempts / rate;

            // Execute estimate update callback
            this.estimateUpdateCallback(expectedAttempts, rate, estimatedSeconds);
        }

        // Update progress on interval (100ms default)
        this.updateProgressInterval = setInterval(updateProgress, this.progressCallbackFrequencyMs || 100);
        // Update estimate on interval (100ms default)
        this.updateEstimateInterval = setInterval(updateEstimate, this.estimateCallbackFrequencyMs || 100);

        try {
            while (this.isRunning) {
                // Generate a batch of keypairs using workers
                const keypairs = await this.generateKeypairBatch(this.currentTargetPrefix);

                // Process results from the batch
                for (const keypair of keypairs) {
                    if (!this.isRunning) break;

                    this.attempts++;

                    // Use pre-computed hex if available, otherwise compute it
                    const publicKeyHex = keypair.publicKeyHex || this.toHex(keypair.publicKey);

                    // Check if keypair contains a blacklisted/reserved prefix
                    const keyPrefix = publicKeyHex.substring(0, 2).toUpperCase();
                    if (this.blacklistPrefixes.includes(keyPrefix)) {
                        continue;
                    }

                    // Debug: Log first few keys to verify generation
                    if (this.attempts <= 5) {
                        console.log(`Key ${this.attempts}: ${publicKeyHex}`);
                        console.log(`Target prefix: ${this.currentTargetPrefix}`);
                        console.log(`First ${this.currentTargetPrefix.length} chars: ${publicKeyHex.substring(0, this.currentTargetPrefix.length)}`);
                        console.log(`Match: ${keypair.matches || this.checkPrefix(publicKeyHex, this.currentTargetPrefix)}`);
                    }

                    // Check if it matches our target prefix (use pre-computed match if available)
                    const matches = keypair.matches !== undefined ? keypair.matches : this.checkPrefix(publicKeyHex, this.currentTargetPrefix);

                    if (matches) {
                        console.log(`Found matching key: ${publicKeyHex} matches ${this.currentTargetPrefix}`);
                        // Validate the generated keypair
                        const privateKeyHex = this.toHex(keypair.privateKey);
                        const validation = await this.validateKeypair(privateKeyHex, publicKeyHex);

                        if (validation.valid) {
                            this.isRunning = false;
                            clearInterval(this.updateProgressInterval);
                            if (this.updateEstimateInterval) {
                                clearInterval(this.updateEstimateInterval);
                            }

                            // Final progress update
                            updateProgress();

                            return {
                                publicKey: publicKeyHex,
                                privateKey: privateKeyHex,
                                attempts: this.attempts,
                                timeElapsed: (Date.now() - this.startTime) / 1000,
                                validation: validation
                            };
                        } else {
                            // If validation fails, continue searching
                            console.warn(`Key validation failed: ${validation.error}, continuing search...`);
                        }
                    }
                }

                // Yield control to prevent blocking the UI
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        } catch (error) {
            this.isRunning = false;
            clearInterval(this.updateProgressInterval);
            if (this.updateEstimateInterval) {
                clearInterval(this.updateEstimateInterval);
            }
            throw error;
        }

        return null;
    }

    stop() {
        this.isRunning = false;
        if (this.updateProgressInterval) {
            clearInterval(this.updateProgressInterval);
        }
        if (this.updateEstimateInterval) {
            clearInterval(this.updateEstimateInterval);
        }
        // Workers will continue running for reuse, no need to terminate
    }
}

// Global key generator instance
const keyGenerator = new MeshCoreKeyGenerator();
