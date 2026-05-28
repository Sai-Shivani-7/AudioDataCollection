export const voiceQuestions = [
  {
    id: 'q1',
    text: 'Please introduce yourself and describe how your day has been so far.',
  },
  {
    id: 'q2',
    text: 'Please describe a recent conversation or social interaction you remember clearly.',
  },
  {
    id: 'q3',
    text: 'Please explain what you would do if you had to plan a simple trip for tomorrow.',
  },
  {
    id: 'q4',
    text: 'Read the following sentences with their emotion',
    isEmotionReading: true,
    emotions: [
      {
        emotion: 'Calm',
        sentence: "The lake was perfectly still that morning, and the mist was just beginning to lift from the surface of the water.",
      },
      {
        emotion: 'Anger',
        sentence: "How many times do I have to tell you?! This is not okay — not even a little bit okay! You had absolutely no right to do this!",
      },
      {
        emotion: 'Fear',
        sentence: "I... I didn't mean for any of this to happen. Please, just... just give me a chance to explain. I'm sorry — I'm really, really sorry.",
      },
      {
        emotion: 'Happiness',
        sentence: "Oh my gosh, oh my gosh — I got in! I actually got in! I can't believe it — this is the best news I have ever received!",
      },
    ]
  }
];
