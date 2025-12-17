import { useState, type FC } from 'react';
import { FileText, Home, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { SearchModal } from '../modals/SearchModal';

interface MenuItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

interface SidebarProps {
  isOpen: boolean;
}

export const Sidebar: FC<SidebarProps> = ({ isOpen }) => {
  const location = useLocation();
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const handleSearchModal = (): void => {
    setSearchModalOpen((prev) => !prev);
  };

  const menuItems: MenuItem[] = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: FileText, label: 'Add memories', path: '/new-memory' }
    // { icon: FileText, label: 'Memory recall', path: '/memory-recall' }
  ];

  return (
    <>
      <aside
        className={`bg-background border-r border-border transition-all duration-100 flex flex-col ${
          isOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-linear-to-br from-blue-500 to-purple-600 rounded"></div>
            <span className="font-semibold text-foreground text-sm">Memory Layer</span>
          </div>
        </div>

        {/* Search Button */}
        <div className="px-3 py-3">
          <button
            onClick={handleSearchModal}
            className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-foreground bg-background border border-border rounded-md hover:bg-secondary transition-colors"
          >
            <Search size={16} />
            <span>Search memories</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2">
          <ul className="space-y-1">
            {menuItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={index}>
                  <Link
                    to={item.path}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-secondary text-foreground font-medium'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <SearchModal isOpen={searchModalOpen} onClose={handleSearchModal} />
    </>
  );
};
