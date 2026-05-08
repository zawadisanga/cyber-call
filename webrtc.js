// WebRTC Handler for CyberCall

class WebRTCHandler {
  constructor(socket, localVideo, remoteVideo) {
    this.socket = socket;
    this.localVideo = localVideo;
    this.remoteVideo = remoteVideo;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.currentCall = null;
    
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

  async initLocalStream() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      if (this.localVideo) {
        this.localVideo.srcObject = this.localStream;
      }
      
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Try audio only if video fails
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        
        if (this.localVideo) {
          this.localVideo.srcObject = this.localStream;
        }
        
        return this.localStream;
      } catch (audioError) {
        console.error('Error accessing microphone:', audioError);
        throw error;
      }
    }
  }

  createPeerConnection(calleeId, callerId) {
    this.peerConnection = new RTCPeerConnection(this.configuration);
    
    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }
    
    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.remoteVideo) {
        this.remoteVideo.srcObject = this.remoteStream;
      }
    };
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          calleeId,
          callerId
        });
      }
    };
    
    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      
      switch (this.peerConnection.connectionState) {
        case 'connected':
          this.onCallConnected && this.onCallConnected();
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.endCall();
          break;
      }
    };
    
    return this.peerConnection;
  }

  async startCall(calleeId, callerId, callerName) {
    try {
      await this.initLocalStream();
      this.createPeerConnection(calleeId, callerId);
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.socket.emit('call-user', {
        calleeId,
        callerId,
        callerName,
        signalData: offer
      });
      
      this.currentCall = { calleeId, callerId, startTime: Date.now() };
      return true;
    } catch (error) {
      console.error('Error starting call:', error);
      return false;
    }
  }

  async answerCall(callerId, signal) {
    try {
      await this.initLocalStream();
      this.createPeerConnection(callerId, null);
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.socket.emit('answer-call', {
        callerId,
        signal: answer
      });
      
      this.currentCall = { calleeId: callerId, callerId: null, startTime: Date.now() };
      return true;
    } catch (error) {
      console.error('Error answering call:', error);
      return false;
    }
  }

  async handleIncomingCall(callerId, callerName, signal) {
    // Show incoming call UI
    const accept = await this.showIncomingCallUI(callerName);
    
    if (accept) {
      await this.answerCall(callerId, signal);
      return true;
    } else {
      this.socket.emit('reject-call', { callerId });
      return false;
    }
  }

  showIncomingCallUI(callerName) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'incoming-call-modal';
      modal.innerHTML = `
        <div class="incoming-call-content">
          <div class="ringing-animation">
            <i class="fas fa-phone"></i>
          </div>
          <h3>Incoming Call</h3>
          <p>${callerName} is calling you...</p>
          <div class="call-actions">
            <button class="accept-call-btn">
              <i class="fas fa-phone"></i> Accept
            </button>
            <button class="reject-call-btn">
              <i class="fas fa-times"></i> Reject
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const acceptBtn = modal.querySelector('.accept-call-btn');
      const rejectBtn = modal.querySelector('.reject-call-btn');
      
      acceptBtn.onclick = () => {
        modal.remove();
        resolve(true);
      };
      
      rejectBtn.onclick = () => {
        modal.remove();
        resolve(false);
      };
    });
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
    
    if (this.localVideo) {
      this.localVideo.srcObject = null;
    }
    
    if (this.remoteVideo) {
      this.remoteVideo.srcObject = null;
    }
    
    if (this.currentCall) {
      const duration = Math.floor((Date.now() - this.currentCall.startTime) / 1000);
      this.socket.emit('end-call', {
        roomId: this.currentCall.roomId,
        userId: this.currentCall.callerId || this.currentCall.calleeId,
        calleeId: this.currentCall.calleeId,
        duration
      });
      
      this.onCallEnded && this.onCallEnded(duration);
      this.currentCall = null;
    }
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return !videoTrack.enabled;
      }
    }
    return false;
  }

  setCallbacks(callbacks) {
    this.onCallConnected = callbacks.onCallConnected;
    this.onCallEnded = callbacks.onCallEnded;
  }
}

// Group call handler
class GroupCallHandler extends WebRTCHandler {
  constructor(socket, localVideo) {
    super(socket, localVideo, null);
    this.peerConnections = new Map();
    this.remoteVideos = new Map();
    this.maxParticipants = 4;
  }

  async joinGroupRoom(roomId, userId, username) {
    this.currentRoom = roomId;
    this.currentUserId = userId;
    
    await this.initLocalStream();
    
    this.socket.emit('join-call-room', { roomId, userId, username });
    
    this.socket.on('room-users-update', (users) => {
      this.updateParticipants(users);
    });
  }

  addParticipant(participantId, username) {
    if (this.peerConnections.has(participantId)) return;
    
    const peerConnection = this.createPeerConnection(participantId, this.currentUserId);
    this.peerConnections.set(participantId, { peerConnection, username });
    
    // Create and send offer
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        this.socket.emit('group-offer', {
          to: participantId,
          from: this.currentUserId,
          offer: peerConnection.localDescription
        });
      });
  }

  removeParticipant(participantId) {
    const participant = this.peerConnections.get(participantId);
    if (participant) {
      participant.peerConnection.close();
      this.peerConnections.delete(participantId);
      
      // Remove remote video element
      const videoElement = this.remoteVideos.get(participantId);
      if (videoElement) {
        videoElement.remove();
        this.remoteVideos.delete(participantId);
      }
    }
  }

  updateParticipants(users) {
    // Add new participants
    users.forEach(user => {
      if (user.userId !== this.currentUserId && !this.peerConnections.has(user.userId)) {
        this.addParticipant(user.userId, user.username);
      }
    });
    
    // Remove participants who left
    this.peerConnections.forEach((_, userId) => {
      if (!users.find(u => u.userId === userId)) {
        this.removeParticipant(userId);
      }
    });
  }

  leaveGroupRoom() {
    this.socket.emit('leave-call-room', {
      roomId: this.currentRoom,
      userId: this.currentUserId
    });
    
    this.peerConnections.forEach((_, userId) => {
      this.removeParticipant(userId);
    });
    
    this.endCall();
  }
}

window.WebRTCHandler = WebRTCHandler;
window.GroupCallHandler = GroupCallHandler;
