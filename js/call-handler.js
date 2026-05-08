// Call Handler for CyberCall

class CallHandler {
    constructor() {
        this.localStream = null;
        this.peerConnection = null;
        this.currentCall = null;
        this.isMuted = false;
        this.isVideoOff = false;
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        };
    }
    
    async initLocalStream(videoEnabled = true) {
        try {
            const constraints = {
                audio: true,
                video: videoEnabled ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            
            // Try audio only if video fails
            if (videoEnabled) {
                return this.initLocalStream(false);
            }
            throw error;
        }
    }
    
    createPeerConnection(remoteUserId, isCaller) {
        this.peerConnection = new RTCPeerConnection(this.configuration);
        
        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            if (this.onRemoteStream) {
                this.onRemoteStream(event.streams[0]);
            }
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onICECandidate) {
                this.onICECandidate(event.candidate, remoteUserId);
            }
        };
        
        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            
            switch (state) {
                case 'connected':
                    if (this.onCallConnected) this.onCallConnected();
                    break;
                case 'disconnected':
                case 'failed':
                case 'closed':
                    this.endCall();
                    if (this.onCallDisconnected) this.onCallDisconnected();
                    break;
            }
        };
        
        return this.peerConnection;
    }
    
    async startCall(remoteUserId, isVideoCall = true) {
        try {
            await this.initLocalStream(isVideoCall);
            this.createPeerConnection(remoteUserId, true);
            
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.currentCall = {
                remoteUserId,
                startTime: Date.now(),
                isVideoCall
            };
            
            return offer;
        } catch (error) {
            console.error('Error starting call:', error);
            throw error;
        }
    }
    
    async answerCall(offer, isVideoCall = true) {
        try {
            await this.initLocalStream(isVideoCall);
            this.createPeerConnection(null, false);
            
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.currentCall = {
                startTime: Date.now(),
                isVideoCall
            };
            
            return answer;
        } catch (error) {
            console.error('Error answering call:', error);
            throw error;
        }
    }
    
    async setRemoteAnswer(answer) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }
    
    async addICECandidate(candidate) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }
    
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isMuted = !this.isMuted;
                audioTrack.enabled = !this.isMuted;
                return this.isMuted;
            }
        }
        return false;
    }
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                this.isVideoOff = !this.isVideoOff;
                videoTrack.enabled = !this.isVideoOff;
                return this.isVideoOff;
            }
        }
        return false;
    }
    
    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        const duration = this.currentCall ? Math.floor((Date.now() - this.currentCall.startTime) / 1000) : 0;
        
        if (this.onCallEnded) {
            this.onCallEnded(duration);
        }
        
        this.currentCall = null;
        this.isMuted = false;
        this.isVideoOff = false;
        
        return duration;
    }
    
    getCallDuration() {
        if (this.currentCall && this.currentCall.startTime) {
            return Math.floor((Date.now() - this.currentCall.startTime) / 1000);
        }
        return 0;
    }
    
    setCallbacks(callbacks) {
        this.onRemoteStream = callbacks.onRemoteStream;
        this.onICECandidate = callbacks.onICECandidate;
        this.onCallConnected = callbacks.onCallConnected;
        this.onCallDisconnected = callbacks.onCallDisconnected;
        this.onCallEnded = callbacks.onCallEnded;
    }
}

// Group Call Handler
class GroupCallHandler extends CallHandler {
    constructor() {
        super();
        this.peerConnections = new Map();
        this.participants = new Map();
        this.maxParticipants = 4;
    }
    
    async joinGroup(roomId, userId, username) {
        this.currentRoom = roomId;
        this.currentUserId = userId;
        
        await this.initLocalStream(true);
        
        if (this.onParticipantsUpdate) {
            this.onParticipantsUpdate(Array.from(this.participants.values()));
        }
    }
    
    addParticipant(participantId, username) {
        if (this.peerConnections.has(participantId)) return;
        if (this.participants.size >= this.maxParticipants) {
            if (this.onMaxParticipantsReached) {
                this.onMaxParticipantsReached();
            }
            return;
        }
        
        const pc = new RTCPeerConnection(this.configuration);
        
        // Add local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            if (this.onParticipantStream) {
                this.onParticipantStream(participantId, event.streams[0]);
            }
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && this.onICECandidate) {
                this.onICECandidate(event.candidate, participantId);
            }
        };
        
        this.peerConnections.set(participantId, pc);
        this.participants.set(participantId, { username, pc });
        
        // Create and send offer
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(() => {
                if (this.onOffer) {
                    this.onOffer(participantId, pc.localDescription);
                }
            });
        
        if (this.onParticipantsUpdate) {
            this.onParticipantsUpdate(Array.from(this.participants.values()));
        }
    }
    
    async handleOffer(participantId, offer) {
        const pc = this.peerConnections.get(participantId);
        if (!pc) return;
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        if (this.onAnswer) {
            this.onAnswer(participantId, answer);
        }
    }
    
    async handleAnswer(participantId, answer) {
        const pc = this.peerConnections.get(participantId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }
    
    async handleICECandidate(participantId, candidate) {
        const pc = this.peerConnections.get(participantId);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }
    
    removeParticipant(participantId) {
        const participant = this.peerConnections.get(participantId);
        if (participant) {
            participant.close();
            this.peerConnections.delete(participantId);
            this.participants.delete(participantId);
            
            if (this.onParticipantRemoved) {
                this.onParticipantRemoved(participantId);
            }
            if (this.onParticipantsUpdate) {
                this.onParticipantsUpdate(Array.from(this.participants.values()));
            }
        }
    }
    
    leaveGroup() {
        this.peerConnections.forEach((pc, participantId) => {
            pc.close();
        });
        this.peerConnections.clear();
        this.participants.clear();
        this.endCall();
    }
    
    setGroupCallbacks(callbacks) {
        this.onOffer = callbacks.onOffer;
        this.onAnswer = callbacks.onAnswer;
        this.onICECandidate = callbacks.onICECandidate;
        this.onParticipantStream = callbacks.onParticipantStream;
        this.onParticipantsUpdate = callbacks.onParticipantsUpdate;
        this.onParticipantRemoved = callbacks.onParticipantRemoved;
        this.onMaxParticipantsReached = callbacks.onMaxParticipantsReached;
    }
}

window.CallHandler = CallHandler;
window.GroupCallHandler = GroupCallHandler;
