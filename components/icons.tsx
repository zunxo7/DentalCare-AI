import React from 'react';
import { HiArrowPath } from 'react-icons/hi2';

// FIX: Explicitly type iconProps to satisfy SVGProps<SVGSVGElement> type constraints for strokeLinecap and strokeLinejoin.
const iconProps: React.SVGProps<SVGSVGElement> = {
  className: "w-6 h-6",
  strokeWidth: 1.5,
  stroke: "currentColor",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

// FIX: Update all icon components to accept and spread props, allowing for customization.
export const BackIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 6l-6 6l6 6" />
  </svg>
);

export const DashboardIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M4 4h6v8h-6z" />
    <path d="M4 16h6v4h-6z" />
    <path d="M14 12h6v8h-6z" />
    <path d="M14 4h6v4h-6z" />
  </svg>
);

export const SendIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10 14l11 -11" /><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
  </svg>
);

export const BotIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-6 h-6 text-white" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 16c.83 .56 1.86 .88 2.99 .98" /><path d="M13.01 16.98c1.13 -.1 2.16 -.42 2.99 -.98" /><path d="M9 12v-1" /><path d="M15 12v-1" /><path d="M12 12v-1" /><path d="M12 21a9 9 0 0 0 9 -9a9 9 0 0 0 -9 -9a9 9 0 0 0 -9 9a9 9 0 0 0 9 9z" /><path d="M7.5 15.5a3.5 3.5 0 0 1 9 0" />
  </svg>
);

export const UserCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855" />
  </svg>
);

export const VideoIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z" /><path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" />
  </svg>
);

export const ImageIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l2 2" />
  </svg>
);

export const TotalMessagesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-10 h-10" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" /><path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
  </svg>
);

export const UniqueUsersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-10 h-10" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </svg>
);

export const TotalFaqsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-10 h-10" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 16h8" /><path d="M8 12h8" /><path d="M10 12v-2a2 2 0 1 1 4 0v2" /><path d="M12 21a9 9 0 0 0 9 -9a9 9 0 0 0 -9 -9a9 9 0 0 0 -9 9a9 9 0 0 0 9 9z" />
  </svg>
);

export const TimeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-10 h-10" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12h-3.5" /><path d="M12 7v5" />
  </svg>
);

export const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 5l0 14" /><path d="M5 12l14 0" />
  </svg>
);

export const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

export const EditIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" /><path d="M16 5l3 3" />
  </svg>
);

export const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" /><path d="M21 21l-6 -6" />
  </svg>
);

export const DragHandleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5 cursor-grab" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M5 15m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 15m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 15m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  </svg>
);

export const SpinnerIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg className="animate-spin h-5 w-5 text-text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export const FaqIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 16h8" /><path d="M8 12h8" /><path d="M10 12v-2a2 2 0 1 1 4 0v2" /><path d="M12 21a9 9 0 0 0 9 -9a9 9 0 0 0 -9 -9a9 9 0 0 0 -9 9a9 9 0 0 0 9 9z" />
  </svg>
);

export const MediaIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l2 2" />
  </svg>
);

export const LogoutIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2" /><path d="M9 12h12l-3 -3" /><path d="M18 15l3 -3" />
  </svg>
);

export const ChatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1" /><path d="M8 12l0 .01" /><path d="M12 12l0 .01" /><path d="M16 12l0 .01" />
  </svg>
);

export const LockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" /><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M8 11v-4a4 4 0 0 1 8 0v4" />
  </svg>
);

export const MenuIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M4 6l16 0" /><path d="M4 12l16 0" /><path d="M4 18l16 0" />
  </svg>
);

export const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

export const FlagIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z" /><path d="M5 21v-7" />
  </svg>
);

export const ArrowUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 5l0 14" /><path d="M18 11l-6 -6" /><path d="M6 11l6 -6" />
  </svg>
);

export const ArrowDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 5l0 14" /><path d="M18 13l-6 6" /><path d="M6 13l6 6" />
  </svg>
);

export const RefreshIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <HiArrowPath {...props} className={`w-5 h-5 ${props.className || ''}`} />
);

export const TablesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 3h18v18h-18z" /><path d="M3 9h18" /><path d="M9 3v18" />
  </svg>
);

export const LogsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" /><path d="M4 10h16" /><path d="M10 4v16" />
  </svg>
);

export const ReportsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 12l6 0" /><path d="M9 16l6 0" />
  </svg>
);

export const EmbeddingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M12 3a9 9 0 0 0 -9 9a9 9 0 0 0 9 9a9 9 0 0 0 9 -9a9 9 0 0 0 -9 -9z" /><path d="M12 8l0 8" /><path d="M8 12l8 0" />
  </svg>
);

export const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
  </svg>
);

export const EyeOffIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" />
  </svg>
);

export const ChipIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);