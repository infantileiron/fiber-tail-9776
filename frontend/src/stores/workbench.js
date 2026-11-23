import {hasToken, post, request, setToken} from '../api/client.js';
import {Role} from '../types/domain.js';

export const state = {user: null, lots: [], workspace: null, report: null, audit: []};
export const isAnalyst = () => state.user?.role === Role.ANALYST;
export const isReviewer = () => state.user?.role === Role.REVIEWER;
export const isObserver = () => state.user?.role === Role.OBSERVER;

export async function restore() {
    if (hasToken()) state.user = await request('/auth/me');
}

export async function login(user) {
    const session = await post('/auth/login', user);
    state.user = session.user;
    setToken(session.token);
}

export function logout() {
    setToken(null);
    Object.assign(state, {user: null, lots: [], workspace: null, report: null, audit: []});
}
