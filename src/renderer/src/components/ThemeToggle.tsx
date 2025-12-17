import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@renderer/context/ThemeContext';
import { type FC } from 'react';

export const ThemeToggle: FC = () => {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' }
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`
            relative px-3 py-1.5 rounded-md transition-all duration-200 flex items-center gap-2
            ${
              theme === value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }
          `}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
};

export const ThemeToggleCompact: FC = () => {
  const { theme, setTheme } = useTheme();

  const cycleTheme = (): void => {
    const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(nextTheme);
  };

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <button
      onClick={cycleTheme}
      className="p-1.5 rounded-md hover:bg-secondary transition-colors text-foreground"
      title={`Theme: ${theme}`}
    >
      <Icon size={20} />
    </button>
  );
};
