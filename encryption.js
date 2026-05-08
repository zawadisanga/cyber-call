// Encryption utilities for CyberCall

class EncryptionHandler {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  // Generate a random encryption key
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

  // Encrypt message
  async encryptMessage(message, key) {
    try {
      const encodedMessage = this.encoder.encode(message);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        encodedMessage
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

  // Decrypt message
  async decryptMessage(encryptedData, key) {
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

  // Generate key pair for end-to-end encryption
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

  // Derive shared secret
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

  // Export public key
  async exportPublicKey(key) {
    const exported = await crypto.subtle.exportKey("spki", key);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(exported)));
  }

  // Import public key
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

  // Hash password for storage
  async hashPassword(password) {
    const encoded = this.encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)));
  }

  // Simple XOR encryption for voice notes (fast, lightweight)
  encryptVoiceNote(audioData, key) {
    const dataArray = new Uint8Array(audioData);
    const keyArray = new Uint8Array(this.encoder.encode(key));
    const encrypted = new Uint8Array(dataArray.length);
    
    for (let i = 0; i < dataArray.length; i++) {
      encrypted[i] = dataArray[i] ^ keyArray[i % keyArray.length];
    }
    
    return encrypted;
  }

  decryptVoiceNote(encryptedData, key) {
    return this.encryptVoiceNote(encryptedData, key); // XOR is symmetric
  }

  // Generate random session ID for calls
  generateSessionId() {
    return crypto.randomUUID();
  }

  // Verify message integrity using HMAC
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
    const expectedSignature = await this.generateHMAC(message, key);
    return signature === expectedSignature;
  }
}

// Voice note recorder
class VoiceNoteRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
  }

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        
        // Stop all tracks
        if (this.mediaRecorder.stream) {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        resolve(audioBlob);
      };
      
      this.mediaRecorder.stop();
      this.isRecording = false;
    });
  }

  playVoiceNote(audioBlob) {
    const audio = new Audio();
    const url = URL.createObjectURL(audioBlob);
    audio.src = url;
    audio.play();
    
    audio.onended = () => {
      URL.revokeObjectURL(url);
    };
    
    return audio;
  }

  async saveVoiceNote(audioBlob, encryptionKey) {
    const encryption = new EncryptionHandler();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const encrypted = encryption.encryptVoiceNote(new Uint8Array(arrayBuffer), encryptionKey);
    
    const encryptedBlob = new Blob([encrypted], { type: 'audio/encrypted' });
    const url = URL.createObjectURL(encryptedBlob);
    
    return { url, encryptedBlob };
  }
}

window.EncryptionHandler = EncryptionHandler;
window.VoiceNoteRecorder = VoiceNoteRecorder;
