import React from 'react';
import { InteractiveVoiceModal } from './InteractiveVoiceModal';

interface ElevenLabsVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMissionScript?: string;
}

// Seamless backwards-compatible component forwarding to InteractiveVoiceModal
export const ElevenLabsVoiceModal: React.FC<ElevenLabsVoiceModalProps> = (props) => {
  return <InteractiveVoiceModal {...props} />;
};
