self.onmessage = event => {
  try {
    const {pattern, flags, text} = event.data;
    if (pattern.length > 256 || text.length > 4096 || !/^[dgimsuvy]*$/.test(flags)) throw new Error('Regex input exceeds the supported bounds.');
    const expression = new RegExp(pattern, flags);
    const matches = text.match(expression);
    self.postMessage({matches: matches ? [...matches] : []});
  } catch (error) {
    self.postMessage({error: error.message});
  }
};
