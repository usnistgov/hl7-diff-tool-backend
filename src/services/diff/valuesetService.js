let ValuesetService = {
  populateValuesetsMap: function (valuesetsMap, igId, valuesets) {
    if (valuesets) {
      if (!valuesetsMap[igId]) {
        valuesetsMap[igId] = {};
      }
      valuesets.forEach((valueset) => {
        const vsObject = valueset.Valueset[0];
        const bindingId = vsObject['$'].bindingIdentifier;
        let version = vsObject['$'].version;
        if (version === '') {
          version = null;
        }
        if (!valuesetsMap[igId][bindingId]) {
          valuesetsMap[igId][bindingId] = {};
        }

        if (!valuesetsMap[igId][bindingId][version]) {
          valuesetsMap[igId][bindingId][version] =
            this.extractValueset(vsObject);
        }
      });
    }
  },
  extractValueset: function (valueset) {
    let result = {};
    if (valueset) {
      result = {
        id: valueset['$'].id,
        title: valueset['$'].title,
        name: valueset['$'].name,
        description: valueset['$'].description,
        bindingIdentifier: valueset['$'].bindingIdentifier,
        codeSystemIds: valueset['$'].codeSystemIds,
        contentDefinition: valueset['$'].contentDefinition,
        extensibility: valueset['$'].extensibility,
        numberOfCodes: valueset['$'].numberOfCodes,
        oid: valueset['$'].oid,
        stability: valueset['$'].stability,
        version: valueset['$'].version,
        children: this.extractCodes(valueset.Codes),
      };
    }
    return result;
  },
  extractCodes: function (codes) {
    let result = [];
    if (codes && codes[0] && codes[0].Code) {
      codes[0].Code.forEach((code) => {
        if (code['$'].value !== '...') {
          result.push(code['$']);
        }
      });
    }
    result = result.sort(function (a, b) {
      return a.value.localeCompare(b.value);
    });
    return result;
  },

  compareCodes: function (
    src,
    derived,
    originalProfile,
    derivedIgId,
    vs,
    version
  ) {
    let codes = {
      changed: false,
      list: [],
    };
    if (derived) {
      derived.forEach((code) => {
        if (code.usage === 'P') {
          if (
            originalProfile &&
            originalProfile.summaries &&
            originalProfile.summaries.VSWithPUsage
          ) {
            if (
              !originalProfile.summaries.VSWithPUsage[vs + version]
            ) {
              originalProfile.summaries.VSWithPUsage[vs + version] = {
                vs: vs,
                version: version,
              };
            }
            if (
              !originalProfile.summaries.VSWithPUsage[vs + version][
                derivedIgId
              ]
            ) {
              originalProfile.summaries.VSWithPUsage[vs + version][
                derivedIgId
              ] = 0;
            }

            originalProfile.summaries.VSWithPUsage[vs + version][
              derivedIgId
            ]++;
          }
        }
        const c = src.find(
          (x) =>
            x.codeSystem === code.codeSystem && x.value === code.value
        );
        if (c) {
          let clonedCode = Object.assign({}, code);
          if (c.usage !== code.usage) {
            codes.changed = true;
            clonedCode.usage = {
              value: code.usage,
              status: 'changed',
            };
          }

          codes.list.push(code);
        } else {
          codes.changed = true;
          codes.list.push({
            ...code,
            status: 'added',
          });
        }
      });
      src.forEach((code) => {
        const c = derived.find(
          (x) =>
            x.codeSystem === code.codeSystem && x.value === code.value
        );
        if (!c) {
          //code deleted
          codes.changed = true;
          codes.list.push({
            ...code,
            status: 'deleted',
          });
        }
      });
    }
    return codes;
  },
  populateSrcValuesets: function (
    igId,
    bindings,
    configuration,
    valuesetsMap,
    context
  ) {
    let results = [];
    if (bindings && configuration.valueset) {
      bindings.forEach((binding) => {
        let bindingDifferential = {
          data: {
            position: binding.position,
            path: binding.path,
            bindingLocation: binding.bindingLocation,
            context: {
              src: {
                value: context,
              },
              derived: {},
            },
            // locations: binding.locations,
            locations: {
              src: {
                value: this.extractLocations(binding.locations),
              },
              derived: {},
            },
            LocationInfoType: binding.LocationInfoType,
            strength: {
              src: {
                value: binding.strength,
              },
              derived: {},
            },
            valuesets: {
              src: {
                value: this.extractVSWithVersion(
                  binding.valuesets,
                  binding.versions,
                  valuesetsMap,
                  igId
                ),
              },
              derived: {},
            },
            codes: this.buildSrcCodes(
              binding.valuesets,
              binding.versions,
              valuesetsMap,
              igId
            ),
          },
          changed: false,
        };
        results.push(bindingDifferential);
      });
    }

    return results;
  },

  buildSrcCodes: function (valuesets, versions, valuesetsMap, igId) {
    let result = {};
    if (valuesets) {
      valuesets.forEach((valueset, i) => {
        if (
          valuesetsMap[igId][valueset] &&
          valuesetsMap[igId][valueset][versions[i]]
        ) {
          result[valueset] = {
            src: {
              value:
                valuesetsMap[igId][valueset][versions[i]].children,
            },
            derived: {},
          };
        }
      });
    }
    return result;
  },

  buildDerivedCodes: function (
    codes,
    valuesets,
    versions,
    valuesetsMap,
    igId
  ) {
    let result = codes;
    if (valuesets) {
      valuesets.forEach((valueset, i) => {
        if (
          valuesetsMap[igId][valueset] &&
          valuesetsMap[igId][valueset][versions[i]]
        ) {
          if (!result[valueset]) {
            result[valueset] = {
              src: {},
              derived: {},
            };
          }

          result[valueset].derived[igId] =
            valuesetsMap[igId][valueset][versions[i]].children;
        }
      });
    }
    return result;
  },

  extractLocations: function (locations) {
    let locs = [];
    let results = [];
    if (locations) {
      locs = locations.split(',');
      locs.forEach((location) => {
        let loc = location.split('.');
        location = loc[loc.length - 1];
        location = parseInt(location);
        results.push(location);
      });
    }
    return results;
  },
  extractVSWithVersion: function (
    valuesets,
    versions,
    valuesetsMap,
    igId
  ) {
    let result = [];
    if (valuesets) {
      valuesets.forEach((valueset, i) => {
        result.push({
          bindingIdentifier: valueset,
          version: versions[i],
          codes: this.getCodes(
            valueset,
            versions[i],
            valuesetsMap,
            igId
          ),
        });
      });
    }
    return result;
  },
  getCodes: function (valueset, version, valuesetsMap, igId) {
    let result = [];
    if (
      valueset &&
      valuesetsMap[igId][valueset] &&
      valuesetsMap[igId][valueset][version]
    ) {
      result = valuesetsMap[igId][valueset][version].children;
    }

    return result;
  },
  extractBindings: function (bindings, currentPath) {
    let result = [];
    if (bindings) {
      bindings.forEach((binding) => {
        const path =
          currentPath === ''
            ? binding['$'].Position1
            : `${currentPath}.${binding['$'].Position1}`;
        if (binding.ValuesetBinding && binding.ValuesetBinding[0]) {
          const details = binding.ValuesetBinding[0]['$'];

          const b = {
            strength: details.strength,
            bindingLocation: details.bindingLocation,
            locations: details.locations,
            position: binding['$'].Position1,
            path,
            LocationInfoType: binding['$'].LocationInfoType,
            valuesets: this.extractValuesetsFromName(details.name),
            versions: this.extractValuesetsFromName(details.version),
          };
          result.push(b);
        }
        if (
          binding.StructureElementBindings &&
          binding.StructureElementBindings[0] &&
          binding.StructureElementBindings[0].StructureElementBinding
        ) {
          result.push.apply(
            result,
            this.extractBindings(
              binding.StructureElementBindings[0]
                .StructureElementBinding,
              path
            )
          );
        }
      });
    }
    return result;
  },
  extractValuesetsFromName: function (name) {
    let valuesets = [];
    if (name) {
      valuesets = name.split(',');
    }
    return valuesets;
  },
};

module.exports = ValuesetService;
