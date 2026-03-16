export const state = {
  tracks: [],
  albums: [],
  currentTrack: null,
  currentAlbum: null,
  currentAlbumId: null,
  audio: null,
  queue: null,
  filters: {
    artist: 'all',
    year: 'all',
    genre: 'all',
    search: ''
  }
};

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Queue {
  constructor(items = []) {
    this.items = [...items];
    this.currentId = null;
    this.shuffleEnabled = false;
    this.repeatEnabled = false;
    this.shuffledItems = [];
    this.shuffleIndex = -1;
  }

  setItems(items = [], currentId = null) {
    this.items = [...items];
    this.currentId = currentId;
    if (this.shuffleEnabled) this.buildShuffle(currentId);
  }

  enqueue(item) {
    if (!item) return;
    const exists = this.items.find(entry => entry._id === item._id);
    if (!exists) {
      this.items.push(item);
      if (this.shuffleEnabled) {
        // Insert at a random position after the current shuffle position
        const tail = this.shuffledItems.slice(this.shuffleIndex + 1);
        const insertAt = Math.floor(Math.random() * (tail.length + 1));
        tail.splice(insertAt, 0, item);
        this.shuffledItems = [...this.shuffledItems.slice(0, this.shuffleIndex + 1), ...tail];
      }
    }
  }

  dequeue() {
    return this.items.shift();
  }

  setCurrent(track) {
    if (!track) return null;
    this.enqueue(track);
    this.currentId = track._id;
    if (this.shuffleEnabled) {
      const idx = this.shuffledItems.findIndex(t => t._id === track._id);
      if (idx !== -1) this.shuffleIndex = idx;
    }
    return this.currentId;
  }

  currentIndexFor(id) {
    return this.items.findIndex(track => track._id === id);
  }

  // Build (or rebuild) the shuffled play order, placing the current track first.
  buildShuffle(currentId) {
    const id = currentId ?? this.currentId;
    this.shuffledItems = fisherYates(this.items);
    // Ensure we start from whichever track is current
    const pos = this.shuffledItems.findIndex(t => t._id === id);
    if (pos > 0) {
      const [cur] = this.shuffledItems.splice(pos, 1);
      this.shuffledItems.unshift(cur);
    }
    this.shuffleIndex = 0;
  }

  next(currentId) {
    if (!this.items.length) return null;
    const idToUse = currentId ?? this.currentId;

    if (this.shuffleEnabled) {
      // Sync index to current track in case it was set externally
      const idx = this.shuffledItems.findIndex(t => t._id === idToUse);
      if (idx !== -1) this.shuffleIndex = idx;

      const next = this.shuffleIndex + 1;
      if (next >= this.shuffledItems.length) {
        if (!this.repeatEnabled) return null;
        // Re-shuffle for the next pass, keeping current track at the end so it
        // doesn't immediately repeat as the first track of the new sequence.
        this.buildShuffle(idToUse);
        if (this.shuffledItems.length > 1) {
          const [first] = this.shuffledItems.splice(0, 1);
          this.shuffledItems.push(first);
          this.shuffleIndex = 0;
        }
      } else {
        this.shuffleIndex = next;
      }
      const track = this.shuffledItems[this.shuffleIndex] ?? null;
      this.currentId = track?._id ?? null;
      return track;
    }

    const index = this.currentIndexFor(idToUse);
    const nextIndex = index === -1 ? 0 : index + 1;
    if (nextIndex >= this.items.length) {
      if (!this.repeatEnabled) return null;
      this.currentId = this.items[0]._id;
      return this.items[0];
    }
    this.currentId = this.items[nextIndex]._id;
    return this.items[nextIndex];
  }

  previous(currentId) {
    if (!this.items.length) return null;
    const idToUse = currentId ?? this.currentId;

    if (this.shuffleEnabled) {
      const idx = this.shuffledItems.findIndex(t => t._id === idToUse);
      if (idx !== -1) this.shuffleIndex = idx;

      const prev = this.shuffleIndex - 1;
      if (prev < 0) {
        if (!this.repeatEnabled) return null;
        this.shuffleIndex = this.shuffledItems.length - 1;
      } else {
        this.shuffleIndex = prev;
      }
      const track = this.shuffledItems[this.shuffleIndex] ?? null;
      this.currentId = track?._id ?? null;
      return track;
    }

    const index = this.currentIndexFor(idToUse);
    const prevIndex = index <= 0 ? this.items.length - 1 : index - 1;
    if (prevIndex === this.items.length - 1 && index <= 0 && !this.repeatEnabled) return null;
    this.currentId = this.items[prevIndex]._id;
    return this.items[prevIndex];
  }

  toggleShuffle() {
    this.shuffleEnabled = !this.shuffleEnabled;
    if (this.shuffleEnabled) this.buildShuffle();
    return this.shuffleEnabled;
  }

  toggleRepeat() {
    this.repeatEnabled = !this.repeatEnabled;
    return this.repeatEnabled;
  }
}
