import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { UI_COPY } from '../i18n/translations.ts';
import type { UiLanguage } from '../types/civic.ts';

export type ActiveTab = 'home' | 'submit' | 'track' | 'officer';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  uiLang: UiLanguage;
  onChangeUiLang: (lang: UiLanguage) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  uiLang,
  onChangeUiLang,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = UI_COPY[uiLang];

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'home', label: t.navHome },
    { id: 'submit', label: t.navSubmit },
    { id: 'track', label: t.navTrack },
    { id: 'officer', label: t.navOfficer },
  ];

  const handleNav = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b-[3px] border-[#FF9933] shadow-[0_4px_12px_rgba(22,46,81,0.05)]">
      <div className="flex items-center justify-between gap-8 px-4 sm:px-8 h-16">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-display text-2xl font-bold tracking-tight text-[#162E51] hover:text-[#005EA2] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005EA2]"
        >
          {t.brand}
        </button>

        {/* Zone 2: Clean Single-Line Text Navigation Links */}
        <nav aria-label="Primary Navigation" className="hidden md:flex items-center gap-7 text-sm">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005EA2] ${
                  isActive
                    ? 'border-[#005EA2] text-[#005EA2] font-semibold'
                    : 'border-transparent text-[#162E51]/75 hover:text-[#162E51] hover:border-[#162E51]/25 font-medium'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action (+ Mobile Menu Button on < md) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('submit')}
            className="px-4 py-2.5 bg-[#005EA2] hover:bg-[#162E51] text-white text-xs font-bold uppercase tracking-wider rounded shadow-[0_2px_4px_rgba(0,94,162,0.2)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005EA2]"
          >
            {uiLang === 'hi' ? 'नई शिकायत दर्ज करें' : 'File New Grievance'}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="md:hidden min-w-[40px] min-h-[40px] p-2 rounded border border-[#162E51]/15 text-[#162E51] hover:bg-[#F8F9FA] flex items-center justify-center transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden bg-white border-t border-[#162E51]/12 px-4 py-3 space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`px-3 py-2.5 rounded text-left text-xs font-semibold border transition-colors whitespace-nowrap truncate ${
                    isActive
                      ? 'bg-[#005EA2] text-white border-[#005EA2]'
                      : 'bg-[#F8F9FA] text-[#162E51] border-[#162E51]/15 hover:border-[#005EA2]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="pt-2 border-t border-[#162E51]/10 flex items-center justify-between">
            <span className="text-xs text-[#162E51]/70">Interface Language</span>
            <button
              type="button"
              onClick={() => onChangeUiLang(uiLang === 'en' ? 'hi' : 'en')}
              className="px-3 py-1.5 rounded border border-[#162E51]/20 bg-[#F8F9FA] text-xs font-semibold text-[#162E51]"
            >
              {uiLang === 'en' ? 'हिन्दी में देखें' : 'Switch to English'}
            </button>
          </div>
        </nav>
      )}
    </header>
  );
};
