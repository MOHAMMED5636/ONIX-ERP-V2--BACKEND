import { getSocketIo } from '../utils/socketIo';
import { fetchProjectChatParticipants } from './projectChatParticipants.service';
import { buildChatDeepLink, sendBrowserPushToUsers } from './browserPush.service';

function formatSenderName(sender: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!sender) return 'User';
  return (
    `${sender.firstName || ''} ${sender.lastName || ''}`.trim() ||
    sender.email ||
    'User'
  );
}

export async function notifyProjectChatMessage(params: {
  projectId: string;
  projectName: string;
  projectReferenceNumber?: string | null;
  chatId: string;
  message: {
    id: string;
    chatId: string;
    senderId: string | null;
    content: string;
    createdAt: Date;
    sender: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      photo: string | null;
      photoUrl?: string | null;
    } | null;
  };
}): Promise<void> {
  const io = getSocketIo();
  if (!io) return;

  const senderName = formatSenderName(params.message.sender);
  const payload = {
    projectId: params.projectId,
    projectName: params.projectName,
    projectReferenceNumber: params.projectReferenceNumber ?? null,
    chatId: params.chatId,
    message: {
      id: params.message.id,
      chatId: params.message.chatId,
      senderId: params.message.senderId,
      content: params.message.content,
      sender: params.message.sender,
      senderName,
      createdAt: params.message.createdAt.toISOString(),
    },
  };

  io.to(`project:${params.projectId}`).emit('project:message', payload);

  const participants = await fetchProjectChatParticipants(params.projectId);
  const senderId = params.message.senderId;
  const notified = new Set<string>();
  for (const participant of participants) {
    if (senderId && participant.id === senderId) continue;
    if (notified.has(participant.id)) continue;
    notified.add(participant.id);
    io.to(`user:${participant.id}`).emit('project:message', payload);
  }

  // Also broadcast so admins/PMs (not only task assignees) receive notifications.
  // Clients ignore their own messages.
  io.emit('project:message', payload);

  const preview = String(params.message.content || '').trim().slice(0, 180);
  void sendBrowserPushToUsers(
    participants.map((p) => p.id),
    {
      title: `${senderName} — ${params.projectReferenceNumber || params.projectName}`,
      body: preview || 'New project chat message',
      url: buildChatDeepLink(params.projectId),
      tag: `project-chat-${params.projectId}`,
    },
    senderId,
  );
}
