// Client-side encryption for CyberCall

class EncryptionClient {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.sessionKeys = new Map();
    }
    
    async generateKey() {
        return await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    }
    
    async encrypt(data, key) {
        try {
            const encoded = typeof data === 'string' ? this.encoder.encode(data) : data;
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            const encrypted = await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                encoded
            );
            
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);
            
            return btoa(String.fromCharCode.apply(null, combined));
        } catch (error) {
            console.error('Encryption error:', error);
            return null;
        }
    }
    
    async decrypt(encryptedData, key) {
        try {
            const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                data
            );
            
            return this.decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }
    
    async generateKeyPair() {
        return await crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256"
            },
            true,
            ["deriveKey", "deriveBits"]
        );
    }
    
    async deriveSharedSecret(privateKey, publicKey) {
        return await crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: publicKey
            },
            privateKey,
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    }
    
    async exportPublicKey(key) {
        const exported = await crypto.subtle.exportKey("spki", key);
        return btoa(String.fromCharCode.apply(null, new Uint8Array(exported)));
    }
    
    async importPublicKey(keyData) {
        const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
        return await crypto.subtle.importKey(
            "spki",
            binaryKey,
            {
                name: "ECDH",
                namedCurve: "P-256"
            },
            true,
            []
        );
    }
    
    async getSessionKey(peerId, myPrivateKey, peerPublicKey) {
        if (this.sessionKeys.has(peerId)) {
            return this.sessionKeys.get(peerId);
        }
        
        const sharedSecret = await this.deriveSharedSecret(myPrivateKey, peerPublicKey);
        this.sessionKeys.set(peerId, sharedSecret);
        return sharedSecret;
    }
    
    encryptMessage(message, sessionKey) {
        return this.encrypt(message, sessionKey);
    }
    
    decryptMessage(encrypted, sessionKey) {
        return this.decrypt(encrypted, sessionKey);
    }
    
    // Simple encryption for voice notes (fast, lightweight)
    xorEncrypt(data, key) {
        const dataArray = new Uint8Array(data);
        const keyArray = new Uint8Array(this.encoder.encode(key));
        const encrypted = new Uint8Array(dataArray.length);
        
        for (let i = 0; i < dataArray.length; i++) {
            encrypted[i] = dataArray[i] ^ keyArray[i % keyArray.length];
        }
        
        return encrypted;
    }
    
    xorDecrypt(data, key) {
        return this.xorEncrypt(data, key); // XOR is symmetric
    }
    
    async hashPassword(password) {
        const encoded = this.encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', encoded);
        return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)));
    }
    
    generateRandomId() {
        return crypto.randomUUID();
    }
    
    async generateHMAC(message, key) {
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            this.encoder.encode(key),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        
        const signature = await crypto.subtle.sign(
            "HMAC",
            cryptoKey,
            this.encoder.encode(message)
        );
        
        return btoa(String.fromCharCode.apply(null, new Uint8Array(signature)));
    }
    
    async verifyHMAC(message, signature, key) {
        const expected = await this.generateHMAC(message, key);
        return signature === expected;
    }
}

// Voice note recorder with encryption
class SecureVoiceRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.encryption = new EncryptionClient();
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            return false;
        }
    }
    
    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || !this.isRecording) {
                resolve(null);
                return;
            }
            
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.audioChunks = [];
                
                // Stop all tracks
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
                
                // Encrypt the voice note
                const arrayBuffer = await audioBlob.arrayBuffer();
                const sessionKey = await this.encryption.generateKey();
                const encrypted = await this.encryption.encrypt(arrayBuffer, sessionKey);
                
                resolve({
                    encrypted,
                    sessionKey,
                    originalSize: arrayBuffer.byteLength
                });
            };
            
            this.mediaRecorder.stop();
            this.isRecording = false;
        });
    }
    
    async decryptVoiceNote(encryptedData, sessionKey) {
        const decrypted = await this.encryption.decrypt(encryptedData, sessionKey);
        if (decrypted) {
            // Convert base64 back to blob
            const binaryString = atob(decrypted);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], { type: 'audio/webm' });
        }
        return null;
    }
    
    playVoiceNote(blob) {
        const audio = new Audio();
        const url = URL.createObjectURL(blob);
        audio.src = url;
        audio.play();
        
        audio.onended = () => {
            URL.revokeObjectURL(url);
        };
        
        return audio;
    }
}

window.EncryptionClient = EncryptionClient;
window.SecureVoiceRecorder = SecureVoiceRecorder;
