export interface Profile {
  username: string
  email: string
  memberSince: string
  emailDigestEnabled: boolean
  userId?: string
  city?: string
  hasCompletedOnboarding?: boolean
  searchable?: boolean
}

export interface Member {
  user_id: string
  username: string
  email: string
  role: string
  color?: string
}

export interface Group {
  groups_id: string
  groups_title: string
  groups_description: string
  tag_name: string
  members?: Member[]
  events?: CalEvent[]
  todoLists?: TaskList[]
  totalEvents?: number
  totalTasks?: { all: number; completed: number }
}

export interface CalEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay?: boolean
  backgroundColor?: string
  extendedProps?: {
    description?: string
    location?: string
    imageUrl?: string
    eventType?: 'appointment' | 'social'
    participants?: { userId: string; username: string; rsvpStatus: string }[]
    groupName?: string
    groupsId?: string
    createdBy?: string
    recurrenceRule?: string | null
    isRecurring?: boolean
    recurringEventId?: string | number
    occurrenceDate?: string | null
    canManage?: boolean
    reminderMinutes?: number | null
  }
}

export interface SavedEvent {
  discovery_id: string
  snapshot: import('@/lib/mockData').DiscoveryEvent
  created_at?: string
}

export interface ProfileStats {
  eventsThisMonth: number
  groups: number
  saved: number
}

export interface TaskList {
  taskListInfo: {
    idTl: string
    idG: string
    title: string
    desc?: string
    tag_group: string
  }
  taskItems: Task[]
  totalTasks: number
  totalCompletedTasks: number
  progressWidth: number
}

export interface Task {
  task_id: string
  task_title: string
  task_description?: string
  is_completed: boolean
  priority?: string
  due_date?: string
  members?: { username: string; userId: string }[]
  assignees?: { userId: string; username: string | null }[]
}

export interface Invite {
  groups_id: string
  groups_title: string
  groups_description: string
  tag_name: string
}

export type NotificationType =
  | 'group_invite'
  | 'event_invite'
  | 'rsvp_reply'
  | 'event_changed'
  | 'event_cancelled'
  | 'event_reminder'

export interface AppNotification {
  notification_id: number
  type: NotificationType | string
  title: string
  body?: string | null
  link?: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationPrefs {
  group_invites: boolean
  event_invites: boolean
  rsvp_replies: boolean
  event_changes: boolean
}
