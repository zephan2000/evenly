import React, { createContext, useContext, useState } from 'react';

export type HeadlineMood = 'steady' | 'breezy' | 'postcard';

type MockFontSetContextValue = {
  headlineMood: HeadlineMood;
  setHeadlineMood: (value: HeadlineMood) => void;
};

const MockFontSetContext = createContext<MockFontSetContextValue | null>(null);

export function MockFontSetProvider({ children }: { children: React.ReactNode }) {
  const [headlineMood, setHeadlineMood] = useState<HeadlineMood>('breezy');

  return (
    <MockFontSetContext.Provider value={{ headlineMood, setHeadlineMood }}>
      {children}
    </MockFontSetContext.Provider>
  );
}

export function useMockFontSet() {
  const context = useContext(MockFontSetContext);
  if (!context) {
    throw new Error('useMockFontSet must be used within a MockFontSetProvider');
  }

  return context;
}
