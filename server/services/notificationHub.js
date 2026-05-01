const clients = new Map();

const addClient = (userId, res) => {
    if (!clients.has(userId)) {
        clients.set(userId, new Set());
    }
    clients.get(userId).add(res);
};

const removeClient = (userId, res) => {
    if (!clients.has(userId)) return;
    const set = clients.get(userId);
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
};

const sendToUser = (userId, payload) => {
    const set = clients.get(userId);
    if (!set) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    set.forEach((res) => {
        res.write(data);
    });
};

module.exports = { addClient, removeClient, sendToUser };
