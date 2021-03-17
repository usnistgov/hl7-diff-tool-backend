let ValuesetService = {
  populateValuesetsMap: function(valuesetsMap, igId, valuesets) {
    if (valuesets) {
      if (!valuesetsMap[igId]) {
        valuesetsMap[igId] = {};
      }
      valuesets.forEach(valueset => {
        const vsObject = valueset.Valueset[0];
        const bindingId = vsObject["$"].bindingIdentifier;
        let version = vsObject["$"].version;
        if (version === "") {
          version = null;
        }
        if (!valuesetsMap[igId][bindingId]) {
          valuesetsMap[igId][bindingId] = {};
        }

        if (!valuesetsMap[igId][bindingId][version]) {
          valuesetsMap[igId][bindingId][version] = this.extractValueset(
            vsObject
          );
        }
      });
    }
  },
  extractValueset(valueset) {
    let result = {};
    if (valueset) {
      result = {
        id: valueset["$"].id,
        title: valueset["$"].title,
        name: valueset["$"].name,
        description: valueset["$"].description,
        bindingIdentifier: valueset["$"].bindingIdentifier,
        codeSystemIds: valueset["$"].codeSystemIds,
        contentDefinition: valueset["$"].contentDefinition,
        extensibility: valueset["$"].extensibility,
        numberOfCodes: valueset["$"].numberOfCodes,
        oid: valueset["$"].oid,
        stability: valueset["$"].stability,
        version: valueset["$"].version,
        children: this.extractCodes(valueset.Codes)
      };
    }
    return result;
  },
  extractCodes(codes) {
    let result = [];
    if (codes && codes[0] && codes[0].Code) {
      codes[0].Code.forEach(code => {
        if (code["$"].value !== "...") {
          result.push(code["$"]);
        }
      });
    }
    result = result.sort(function(a, b) {
      return a.value.localeCompare(b.value);
    });
    return result;
  },

  compareCodes(src, derived) {
    let codes = {
      changed: false,
      list: []
    };
    if (derived) {
      derived.forEach(code => {
        const c = src.find(
          x => x.codeSystem === code.codeSystem && x.value === code.value
        );
        if (c) {
          let clonedCode = Object.assign({}, code);
          if (c.usage !== code.usage) {
            codes.changed = true;
            clonedCode.usage = {
              value: code.usage,
              status: "changed"
            };
          }

          codes.list.push(code);
        } else {
          codes.changed = true;
          codes.list.push({
            ...code,
            status: "added"
          });
        }
      });
    }
    return codes;

    let hasChanged = false;
    if (src && derived) {
      if (src.length === derived.length) {
        src.forEach((code, i) => {
          if (code.value !== derived[i].value) {
            hasChanged = true;
          }
          if (code.description !== derived[i].description) {
            hasChanged = true;
          }
          if (code.codeSystem !== derived[i].codeSystem) {
            hasChanged = true;
          }
          if (code.usage !== derived[i].usage) {
            hasChanged = true;
          }
          if (code.comment !== derived[i].comment) {
            hasChanged = true;
          }
        });
      } else {
        hasChanged = true;
      }
    }

    return hasChanged;
  }
};

module.exports = ValuesetService;
