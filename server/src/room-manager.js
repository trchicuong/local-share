/**
 * Local Share (LoS) Room Manager
 * Handles LAN Auto-discovery (IP rooms), Paired Secret Rooms, and Public Rooms
 */

export default class RoomManager {
  constructor() {
    // Map<roomId, Map<peerId, Peer>>
    this.ipRooms = new Map();
    this.secretRooms = new Map();
    this.publicRooms = new Map();

    // Map<pairKey, { initiator: Peer, secret: string, expiresAt: number }>
    this.pendingPairings = new Map();
  }

  // --- IP Room (LAN discovery) ---
  joinIpRoom(peer) {
    if (!this.ipRooms.has(peer.ip)) {
      this.ipRooms.set(peer.ip, new Map());
    }
    const room = this.ipRooms.get(peer.ip);
    const otherPeers = [];
    for (const [id, other] of room) {
      if (id !== peer.id) otherPeers.push(other);
    }
    room.set(peer.id, peer);
    return { room, otherPeers };
  }

  leaveIpRoom(peer) {
    const room = this.ipRooms.get(peer.ip);
    if (!room) return [];
    room.delete(peer.id);
    const otherPeers = Array.from(room.values());
    if (room.size === 0) {
      this.ipRooms.delete(peer.ip);
    }
    return otherPeers;
  }

  // --- Secret Rooms (Paired devices) ---
  joinSecretRoom(peer, secret) {
    if (!secret || typeof secret !== 'string') return { otherPeers: [] };
    if (!this.secretRooms.has(secret)) {
      this.secretRooms.set(secret, new Map());
    }
    const room = this.secretRooms.get(secret);
    const otherPeers = [];
    for (const [id, other] of room) {
      if (id !== peer.id) otherPeers.push(other);
    }
    room.set(peer.id, peer);
    peer.roomSecrets.add(secret);
    return { room, otherPeers };
  }

  leaveSecretRoom(peer, secret) {
    const room = this.secretRooms.get(secret);
    if (!room) return [];
    room.delete(peer.id);
    const otherPeers = Array.from(room.values());
    if (room.size === 0) {
      this.secretRooms.delete(secret);
    }
    peer.roomSecrets.delete(secret);
    return otherPeers;
  }

  leaveAllSecretRooms(peer) {
    const affected = new Map(); // secret -> otherPeers[]
    for (const secret of Array.from(peer.roomSecrets)) {
      const others = this.leaveSecretRoom(peer, secret);
      affected.set(secret, others);
    }
    peer.roomSecrets.clear();
    return affected;
  }

  // --- Public Rooms (Temporary PIN code) ---
  joinPublicRoom(peer, roomId) {
    if (peer.publicRoomId) {
      this.leavePublicRoom(peer);
    }
    if (!this.publicRooms.has(roomId)) {
      this.publicRooms.set(roomId, new Map());
    }
    const room = this.publicRooms.get(roomId);
    const otherPeers = [];
    for (const [id, other] of room) {
      if (id !== peer.id) otherPeers.push(other);
    }
    room.set(peer.id, peer);
    peer.publicRoomId = roomId;
    return { room, otherPeers };
  }

  leavePublicRoom(peer) {
    if (!peer.publicRoomId) return { roomId: null, otherPeers: [] };
    const roomId = peer.publicRoomId;
    const room = this.publicRooms.get(roomId);
    let otherPeers = [];
    if (room) {
      room.delete(peer.id);
      otherPeers = Array.from(room.values());
      if (room.size === 0) {
        this.publicRooms.delete(roomId);
      }
    }
    peer.publicRoomId = null;
    return { roomId, otherPeers };
  }

  // --- Pairing Flow ---
  initiatePairing(peer, pairKey, secret) {
    // 5 minutes expiry
    const expiresAt = Date.now() + 5 * 60 * 1000;
    this.pendingPairings.set(pairKey, { initiator: peer, secret, expiresAt });
    peer.pairKey = pairKey;

    // Auto cleanup expired pairings
    setTimeout(() => {
      this.pendingPairings.delete(pairKey);
    }, 5 * 60 * 1000);
  }

  completePairing(pairKey) {
    const pairing = this.pendingPairings.get(pairKey);
    if (!pairing) return null;
    if (Date.now() > pairing.expiresAt) {
      this.pendingPairings.delete(pairKey);
      return null;
    }
    this.pendingPairings.delete(pairKey);
    return pairing;
  }

  cancelPairing(pairKey) {
    this.pendingPairings.delete(pairKey);
  }

  // --- Queries ---
  /**
   * Find all peers visible to a given peer (deduplicated across all rooms)
   */
  getVisiblePeers(peer) {
    const visiblePeers = new Map();

    const getOrCreate = (id, otherPeer) => {
      if (!visiblePeers.has(id)) {
        visiblePeers.set(id, {
          peer: otherPeer,
          rooms: new Set(),
          secrets: new Set(),
          publicRoomId: null,
        });
      }
      return visiblePeers.get(id);
    };

    // 1. IP Room peers (LAN)
    const ipRoom = this.ipRooms.get(peer.ip);
    if (ipRoom) {
      for (const [id, otherPeer] of ipRoom) {
        if (id !== peer.id) {
          const entry = getOrCreate(id, otherPeer);
          entry.rooms.add('ip');
        }
      }
    }

    // 2. Secret Rooms peers (Paired devices)
    for (const secret of peer.roomSecrets) {
      const secretRoom = this.secretRooms.get(secret);
      if (secretRoom) {
        for (const [id, otherPeer] of secretRoom) {
          if (id !== peer.id) {
            const entry = getOrCreate(id, otherPeer);
            entry.rooms.add('secret');
            entry.secrets.add(secret);
          }
        }
      }
    }

    // 3. Public Room peers
    if (peer.publicRoomId) {
      const publicRoom = this.publicRooms.get(peer.publicRoomId);
      if (publicRoom) {
        for (const [id, otherPeer] of publicRoom) {
          if (id !== peer.id) {
            const entry = getOrCreate(id, otherPeer);
            entry.rooms.add('public');
            entry.publicRoomId = peer.publicRoomId;
          }
        }
      }
    }

    return visiblePeers;
  }

  /**
   * Find a specific peer by ID across all visible scopes
   */
  findRecipientPeer(sender, recipientId) {
    const visible = this.getVisiblePeers(sender);
    const entry = visible.get(recipientId);
    return entry ? entry.peer : null;
  }

  /**
   * Get total counts for diagnostics
   */
  getStats() {
    return {
      ipRoomsCount: this.ipRooms.size,
      secretRoomsCount: this.secretRooms.size,
      publicRoomsCount: this.publicRooms.size,
      pendingPairingsCount: this.pendingPairings.size,
    };
  }
}

