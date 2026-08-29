const stripYamlComment = (value) => {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && quote !== "'") quote = quote === '"' ? '' : '"';
    if (character === "'" && quote !== '"') quote = quote === "'" ? '' : "'";
    if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
};

const splitYamlKeyValue = (value) => {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && quote !== "'") quote = quote === '"' ? '' : '"';
    if (character === "'" && quote !== '"') quote = quote === "'" ? '' : "'";
    if (character === ':' && !quote && (index + 1 === value.length || /\s/.test(value[index + 1]))) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }
  return null;
};

const parseYamlScalar = (value) => {
  const scalar = stripYamlComment(value).trim();
  if (!scalar) return null;
  if (scalar === 'null' || scalar === '~') return null;
  if (scalar === 'true') return true;
  if (scalar === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(scalar)) return Number(scalar);
  if (scalar.startsWith('[') || scalar.startsWith('{')) {
    try {
      return JSON.parse(scalar);
    } catch (_error) {
      throw new Error(`Valeur YAML invalide : ${scalar}`);
    }
  }
  if (scalar.startsWith('"')) {
    try {
      return JSON.parse(scalar);
    } catch (_error) {
      throw new Error(`Chaîne YAML invalide : ${scalar}`);
    }
  }
  if (scalar.startsWith("'") && scalar.endsWith("'")) {
    return scalar.slice(1, -1).replaceAll("''", "'");
  }
  return scalar;
};

const yamlLines = (source) => source.split(/\r?\n/).map((raw, lineNumber) => {
  if (/\t/.test(raw)) throw new Error(`Les tabulations ne sont pas acceptées (ligne ${lineNumber + 1}).`);
  const content = stripYamlComment(raw.trimStart());
  if (!content.trim() || content.trim() === '---') return null;
  return {
    content: content.trim(),
    indent: raw.length - raw.trimStart().length,
    lineNumber: lineNumber + 1,
  };
}).filter(Boolean);

export const parseYaml = (source) => {
  const lines = yamlLines(source);
  if (!lines.length) throw new Error('La configuration YAML est vide.');

  const parseBlock = (start, indent) => {
    if (lines[start]?.indent !== indent) {
      throw new Error(`Indentation YAML inattendue (ligne ${lines[start]?.lineNumber || '?'}) .`);
    }
    return lines[start].content.startsWith('- ')
      ? parseSequence(start, indent)
      : parseMap(start, indent);
  };

  const parseMap = (start, indent, target = {}) => {
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      if (line.indent < indent) break;
      if (line.indent > indent || line.content.startsWith('- ')) {
        throw new Error(`Indentation ou structure YAML invalide (ligne ${line.lineNumber}).`);
      }
      const pair = splitYamlKeyValue(line.content);
      if (!pair || !pair[0]) throw new Error(`Clé YAML invalide (ligne ${line.lineNumber}).`);
      const [key, rawValue] = pair;
      index += 1;
      if (rawValue) {
        target[key] = parseYamlScalar(rawValue);
        continue;
      }
      if (index < lines.length && lines[index].indent > indent) {
        [target[key], index] = parseBlock(index, lines[index].indent);
      } else {
        target[key] = null;
      }
    }
    return [target, index];
  };

  const parseSequence = (start, indent) => {
    const result = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      if (line.indent < indent) break;
      if (line.indent !== indent || !line.content.startsWith('- ')) {
        throw new Error(`Liste YAML invalide (ligne ${line.lineNumber}).`);
      }
      const itemContent = line.content.slice(2).trim();
      index += 1;
      if (!itemContent) {
        if (index < lines.length && lines[index].indent > indent) {
          let item;
          [item, index] = parseBlock(index, lines[index].indent);
          result.push(item);
        } else {
          result.push(null);
        }
        continue;
      }
      const firstPair = splitYamlKeyValue(itemContent);
      if (!firstPair) {
        result.push(parseYamlScalar(itemContent));
        continue;
      }
      const item = {};
      const [key, rawValue] = firstPair;
      if (!key) throw new Error(`Clé YAML invalide (ligne ${line.lineNumber}).`);
      if (rawValue) {
        item[key] = parseYamlScalar(rawValue);
      } else if (index < lines.length && lines[index].indent > indent) {
        [item[key], index] = parseBlock(index, lines[index].indent);
      } else {
        item[key] = null;
      }
      if (index < lines.length && lines[index].indent > indent) {
        const [, nextIndex] = parseMap(index, lines[index].indent, item);
        index = nextIndex;
      }
      result.push(item);
    }
    return [result, index];
  };

  const [config, nextIndex] = parseBlock(0, lines[0].indent);
  if (nextIndex !== lines.length) {
    throw new Error(`Contenu YAML inattendu (ligne ${lines[nextIndex].lineNumber}).`);
  }
  return config;
};

const yamlScalar = (value) => {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  if (!text || /[:#\[\]{},&*!|>'"%@`]/.test(text) || /^[-?]\s|\s$/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
};

export const formatYaml = (value, indent = 0) => {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) return `${prefix}- {}`;
        const [firstKey, firstValue] = entries[0];
        const firstRendered = firstValue && typeof firstValue === 'object'
          ? `\n${formatYaml(firstValue, indent + 4)}`
          : ` ${yamlScalar(firstValue)}`;
        const rest = entries.slice(1).map(([key, entryValue]) => {
          const rendered = entryValue && typeof entryValue === 'object'
            ? `\n${formatYaml(entryValue, indent + 4)}`
            : ` ${yamlScalar(entryValue)}`;
          return `${' '.repeat(indent + 2)}${key}:${rendered}`;
        }).join('\n');
        return `${prefix}- ${firstKey}:${firstRendered}${rest ? `\n${rest}` : ''}`;
      }
      return `${prefix}- ${yamlScalar(item)}`;
    }).join('\n');
  }
  return Object.entries(value).map(([key, entryValue]) => {
    if (entryValue && typeof entryValue === 'object') {
      return `${prefix}${key}:\n${formatYaml(entryValue, indent + 2)}`;
    }
    return `${prefix}${key}: ${yamlScalar(entryValue)}`;
  }).join('\n');
};
