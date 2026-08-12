const crypto = require('crypto');

function createStore() {
  const memory = new Map();
  let db = null;
  const enabled = Boolean(process.env.CLOUDBASE_ENV_ID);
  if (enabled) {
    try {
      const cloudbase = require('@cloudbase/node-sdk');
      const app = cloudbase.init({
        env: process.env.CLOUDBASE_ENV_ID,
        secretId: process.env.TCB_SECRET_ID,
        secretKey: process.env.TCB_SECRET_KEY
      });
      db = app.database().collection(process.env.CLOUDBASE_COLLECTION || 'dream_rooms');
      console.log('CloudBase room persistence enabled');
    } catch (err) {
      console.warn('CloudBase SDK unavailable, using memory store:', err.message);
    }
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  return {
    enabled: Boolean(db),
    async get(code) {
      if (memory.has(code)) return memory.get(code);
      if (!db) return null;
      const result = await db.where({ code }).limit(1).get();
      const room = result.data?.[0] || null;
      if (room) memory.set(code, room);
      return room;
    },
    async set(room) {
      memory.set(room.code, room);
      if (!db) return room;
      const existing = await db.where({ code: room.code }).limit(1).get();
      if (existing.data?.[0]?._id) await db.doc(existing.data[0]._id).update(clone(room));
      else await db.add(clone(room));
      return room;
    }
  };
}

module.exports = { createStore };
