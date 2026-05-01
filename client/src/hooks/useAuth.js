import { useState } from 'react';

const readStoredUser = () => {
    try {
        const storedUser = localStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    } catch {
        return null;
    }
};

export const useAuth = () => {
    const [user] = useState(readStoredUser);

    return { user };
};
