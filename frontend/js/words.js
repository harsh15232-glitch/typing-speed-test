/* words.js — word banks + text generator, shared shape with backend/utils/words.js */

const WORD_BANKS = {
  easy: [
    "the","and","cat","dog","run","sun","big","red","fun","hat","box","cup","pen","bag","top",
    "sit","hop","map","van","fox","key","bed","fan","jam","kid","log","mud","net","owl","pig",
    "rat","sea","tap","use","van","wet","yes","zoo","air","ask","bad","car","day","ear","far",
    "get","him","ice","joy","law","mix","now","out","put","qui","ray","see","try","up","win"
  ],
  medium: [
    "keyboard","function","program","design","system","monitor","browser","project","update",
    "network","server","client","website","feature","context","package","engine","module",
    "device","signal","output","input","memory","folder","script","layout","render","toggle",
    "cursor","widget","format","record","stream","backup","filter","export","import","session",
    "buffer","thread","socket","cluster","gateway","routine","syntax","compile","runtime"
  ],
  hard: [
    "asynchronous","optimization","authentication","infrastructure","implementation","concurrency",
    "polymorphism","serialization","virtualization","orchestration","dependency","architecture",
    "encapsulation","abstraction","inheritance","idempotent","middleware","microservice",
    "cryptography","distributed","throughput","latency","scalability","refactoring","deployment",
    "encryption","validation","normalization","heuristic","algorithmic","recursive","immutable"
  ],
  quotes: [
    "The quick brown fox jumps over the lazy dog while the sun sets slowly behind the hills.",
    "Success is not final, failure is not fatal, it is the courage to continue that truly counts.",
    "In the middle of every difficulty lies opportunity waiting quietly to be discovered by someone.",
    "Typing fast is a skill built through patience, rhythm, and countless hours of focused practice.",
    "The only way to do great work is to love what you do and never stop learning new things.",
    "Discipline is choosing between what you want now and what you want most in the long run."
  ]
};

function generateText(difficulty = "medium", targetWords = 220) {
  if (difficulty === "quotes") {
    const pool = WORD_BANKS.quotes;
    let text = "";
    while (text.split(" ").length < targetWords) {
      text += (text ? " " : "") + pool[Math.floor(Math.random() * pool.length)];
    }
    return text.trim();
  }
  const bank = WORD_BANKS[difficulty] || WORD_BANKS.medium;
  const words = [];
  for (let i = 0; i < targetWords; i++) {
    words.push(bank[Math.floor(Math.random() * bank.length)]);
  }
  return words.join(" ");
}

window.generateText = generateText;
window.WORD_BANKS = WORD_BANKS;
