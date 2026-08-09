import { api } from './client';
import type { User, Role } from '../lib/types';

export function listUsers() {
  return api<{ users: User[] }>('/users');
}

export function createUser(input: { name: string; email: string; password: string; role: Role }) {
  return api<{ user: User }>('/users', { method: 'POST', body: input });
}

export function setUserRole(id: string, role: Role) {
  return api<{ user: User }>(`/users/${id}/role`, { method: 'PATCH', body: { role } });
}

export function disableUser(id: string) {
  return api<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' });
}

export function enableUser(id: string) {
  return api<{ user: User }>(`/users/${id}/enable`, { method: 'POST' });
}
