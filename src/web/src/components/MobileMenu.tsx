import { activeSection, wsConnected, setActiveSection, type Section } from '../state/store';
import { IconHome, IconFolder, IconTerminal, IconBot, IconPlug, IconSettings } from './Icons';

const NAV_ITEMS: { section: Section; icon: () => preact.JSX.Element; label: string }[] = [
  { section: 'home', icon: () => <IconHome size={22} />, label: 'Home' },
  { section: 'filesystem', icon: () => <IconFolder size={22} />, label: 'Filesystem' },
  { section: 'claude', icon: () => <IconTerminal size={22} />, label: 'Terminal' },
  { section: 'agents', icon: () => <IconBot size={22} />, label: 'Auto Agents' },
  { section: 'integrations', icon: () => <IconPlug size={22} />, label: 'Integrations' },
  { section: 'config', icon: () => <IconSettings size={22} />, label: 'Config' },
];

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  onSectionChange: (section: Section) => void;
}

export function MobileMenu({ open, onClose, onSectionChange }: MobileMenuProps) {
  const current = activeSection.value;
  const connected = wsConnected.value;

  return (
    <>
      <div class={`mobile-menu-backdrop${open ? ' visible' : ''}`} onClick={onClose} />
      <div class={`mobile-menu${open ? ' open' : ''}`}>
        <nav class="mobile-menu-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.section}
              class={`mobile-menu-item${current === item.section ? ' active' : ''}`}
              onClick={() => {
                setActiveSection(item.section);
                onSectionChange(item.section);
                onClose();
              }}
            >
              <span class="mobile-menu-icon">{item.icon()}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div class="mobile-menu-footer">
          <span class={`status-dot${connected ? ' online' : ''}`} />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </>
  );
}
