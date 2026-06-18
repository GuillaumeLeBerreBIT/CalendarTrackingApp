export interface Profile {
  username: string
  email: string
  memberSince: string
  emailDigestEnabled: boolean
  userId?: string
  city?: string
  hasCompletedOnboarding?: boolean
  searchable?: boolean
  total_xp?: number
}

export interface Pact {
  pact_id: number
  groups_id: number
  created_by: string
  target_completions: number
  completions_count: number
  starts_at: string
  ends_at: string
  reward_event_id?: number | null
  status: 'active' | 'succeeded' | 'failed'
  created_at?: string
  reward_title?: string
}

export interface GroupChallenge {
  challenge_id: number
  groups_id: number
  created_by: string
  title: string
  description?: string | null
  target_value: number
  current_value: number
  unit: string
  start_date: string
  end_date?: string | null
  is_active: boolean
  created_at?: string
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
  shared_color?: string | null
  members?: Member[]
  events?: CalEvent[]
  todoLists?: TaskList[]
  totalEvents?: number
  totalTasks?: { all: number; completed: number }
}

export type Availability = 'yes' | 'maybe' | 'no'

export interface DateOption {
  optionId: number
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  position: number
  votes: { userId: string; username: string; availability: Availability }[]
  yesCount: number
  maybeCount: number
  noCount: number
  /** Alias of yesCount, kept for the progress-bar callers. */
  voteCount: number
}

export interface CalEvent {
  id: string
  title: string
  start: string
  end?: string
  allDay?: boolean
  backgroundColor?: string
  borderColor?: string
  extendedProps?: {
    description?: string
    location?: string
    imageUrl?: string
    eventType?: 'appointment' | 'social'
    participants?: { userId: string; username: string; rsvpStatus: string }[]
    groupName?: string
    groupsId?: string
    createdBy?: string
    publicToken?: string | null
    recurrenceRule?: string | null
    isRecurring?: boolean
    recurringEventId?: string | number
    occurrenceDate?: string | null
    canManage?: boolean
    reminderMinutes?: number | null
    status?: 'confirmed' | 'tentative' | 'locked' | 'failed'
    pactId?: number
    pactCompletionsCount?: number
    pactTargetCompletions?: number
    pactEndsAt?: string
    dateOptions?: DateOption[]
    myVotes?: Record<number, Availability>
    totalGroupMembers?: number
    resolvedHex?: string | null
    /** Provenance: 'google' for events pulled from a Google calendar. */
    externalSource?: string | null
  }
}

export interface ProfileStats {
  eventsThisMonth: number
  groups: number
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
