import React, { useState, useRef, useEffect, type FC } from 'react';
import {
  Send,
  Loader2,
  Plus,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Edit2,
  ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  isNew: boolean;
}

export const MemoryRecallPage: FC = () => {
  const [chats, setChats] = useState<Chat[]>([
    {
      id: '1',
      title: 'New Chat',
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: 'Hello! How can I help you today?',
          timestamp: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      isNew: true
    }
  ]);
  const [activeChat, setActiveChat] = useState<string>('1');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentChat = chats.find((chat) => chat.id === activeChat);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  const createNewChat = (): void => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Hello! How can I help you today?',
          timestamp: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      isNew: true
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChat(newChat.id);
  };

  const deleteChat = (chatId: string): void => {
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    if (activeChat === chatId && chats.length > 1) {
      const remainingChats = chats.filter((chat) => chat.id !== chatId);
      setActiveChat(remainingChats[0].id);
    }
    setOpenMenuId(null);
  };

  const startEditingTitle = (chatId: string, currentTitle: string): void => {
    setEditingChatId(chatId);
    setEditTitle(currentTitle);
    setOpenMenuId(null);
  };

  const saveTitle = (chatId: string): void => {
    if (editTitle.trim()) {
      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, title: editTitle.trim() } : chat))
      );
    }
    setEditingChatId(null);
  };

  const handleSend = async (): Promise<void> => {
    if (!input.trim() || isLoading || !currentChat) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    // Update chat with user message and generate title if it's the first user message
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === activeChat) {
          const isFirstMessage = chat.messages.length === 1;
          return {
            ...chat,
            messages: [...chat.messages, userMessage],
            title: isFirstMessage
              ? input.trim().slice(0, 50) + (input.length > 50 ? '...' : '')
              : chat.title,
            updatedAt: new Date()
          };
        }
        return chat;
      })
    );

    setInput('');
    setIsLoading(true);

    // Simulate AI response (replace with your actual API call)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'This is a simulated AI response. Replace this with your actual AI integration.',
        timestamp: new Date()
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat
            ? { ...chat, messages: [...chat.messages, aiMessage], updatedAt: new Date() }
            : chat
        )
      );
      setIsLoading(false);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <div className="w-64 border-r border-gray-200 flex flex-col">
        {/* New Chat Button */}
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center max-w-4xl mx-auto">
            <Link
              to="/"
              className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <button
              onClick={createNewChat}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {chats.map((chat) => (
              <div key={chat.id} className="relative group">
                {editingChatId === chat.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => saveTitle(chat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle(chat.id);
                      if (e.key === 'Escape') setEditingChatId(null);
                    }}
                    className="w-full px-3 py-2 text-sm border border-blue-500 rounded-lg focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setActiveChat(chat.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      activeChat === chat.id
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{chat.title}</span>

                    {/* Menu button */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === chat.id ? null : chat.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </div>
                  </button>
                )}

                {/* Dropdown menu */}
                {openMenuId === chat.id && (
                  <div className="absolute right-2 top-10 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    <button
                      onClick={() => startEditingTitle(chat.id, chat.title)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename
                    </button>
                    <button
                      onClick={() => deleteChat(chat.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 shrink-0">
          <div className="px-6 py-4">
            <h1 className="text-lg font-semibold text-gray-900">{currentChat?.title}</h1>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="space-y-6">
              {currentChat?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                    } px-4 py-2.5`}
                  >
                    <div className="text-sm whitespace-pre-wrap wrap-break-word">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white shrink-0">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3 mx-auto">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Recall your memories..."
                  className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm focus:outline-none max-h-32 overflow-y-auto"
                  rows={1}
                  disabled={isLoading}
                />
              </div>
              <div className="flex">
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="p-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
