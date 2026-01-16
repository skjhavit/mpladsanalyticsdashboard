import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Users, Store, Search, BarChart3, Menu, X } from 'lucide-react';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="flex items-center">
                <span className="text-xl font-bold text-blue-900">🇮🇳 GovWork</span>
              </Link>
            </div>
            {/* Desktop Menu */}
            <div className="hidden md:ml-6 md:flex md:space-x-8">
              <Link to="/" className="border-transparent text-gray-500 hover:border-blue-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Link>
              <Link to="/analytics" className="border-transparent text-gray-500 hover:border-blue-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                <BarChart3 className="w-4 h-4 mr-2" />
                Analytics
              </Link>
              <Link to="/mps" className="border-transparent text-gray-500 hover:border-blue-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                <Users className="w-4 h-4 mr-2" />
                MPs
              </Link>
              <Link to="/vendors" className="border-transparent text-gray-500 hover:border-blue-500 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                <Store className="w-4 h-4 mr-2" />
                Vendors
              </Link>
            </div>
          </div>

          <div className="flex items-center">
             {/* Mobile menu button */}
             <div className="md:hidden flex items-center">
               <button
                 onClick={() => setIsOpen(!isOpen)}
                 className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
               >
                 <span className="sr-only">Open main menu</span>
                 {isOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
               </button>
             </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`${isOpen ? 'block' : 'hidden'} md:hidden bg-white border-b border-gray-200 px-4 pt-2 pb-4 space-y-1`}>
        <Link 
          to="/" 
          onClick={() => setIsOpen(false)}
          className="text-gray-600 hover:bg-gray-50 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium flex items-center"
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Dashboard
        </Link>
        <Link 
          to="/analytics" 
          onClick={() => setIsOpen(false)}
          className="text-gray-600 hover:bg-gray-50 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium flex items-center"
        >
          <BarChart3 className="w-5 h-5 mr-3" />
          Analytics
        </Link>
        <Link 
          to="/mps" 
          onClick={() => setIsOpen(false)}
          className="text-gray-600 hover:bg-gray-50 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium flex items-center"
        >
          <Users className="w-5 h-5 mr-3" />
          MPs
        </Link>
        <Link 
          to="/vendors" 
          onClick={() => setIsOpen(false)}
          className="text-gray-600 hover:bg-gray-50 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium flex items-center"
        >
          <Store className="w-5 h-5 mr-3" />
          Vendors
        </Link>
      </div>
    </nav>
  );
}
