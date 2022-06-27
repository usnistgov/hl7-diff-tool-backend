const _ = require("underscore");
const MetricService = require("../metricService");

let ValuesetService = {
  populateValuesetsMap: function(valuesetsMap, igId, valuesets) {
    if (valuesets) {
      if (!valuesetsMap[igId]) {
        valuesetsMap[igId] = {};
      }
      valuesets.forEach(valueset => {
        const bindingId = valueset["$"].BindingIdentifier;

        if (!valuesetsMap[igId][bindingId]) {
          valuesetsMap[igId][bindingId] = {};
        }

        valuesetsMap[igId][bindingId] = this.extractValueset(valueset);
      });
    }
  },
  extractValueset: function(valueset) {
    let result = {};
    if (valueset) {
      //TODO: check rest of fields
      result = {
        id: valueset["$"].id,
        title: valueset["$"].title,
        name: valueset["$"].Name,
        description: valueset["$"].Description,
        bindingIdentifier: valueset["$"].BindingIdentifier,
        codeSystemIds: valueset["$"].codeSystemIds,
        contentDefinition: valueset["$"].ContentDefinition,
        extensibility: valueset["$"].Extensibility,
        numberOfCodes: valueset["$"].numberOfCodes,
        oid: valueset["$"].oid,
        stability: valueset["$"].Stability,
        version: valueset["$"].Version,
        children: this.extractCodes(valueset.ValueElement)
      };
    }

    return result;
  },
  extractCodes: function(codes) {
    let result = [];
    if (codes) {
      codes.forEach(code => {
        result.push({
          value: code["$"].Value,
          usage: code["$"].Usage,
          displayName: code["$"].DisplayName,
          codeSystem: code["$"].CodeSystem
        });
      });
    }
    result = result.sort(function(a, b) {
      return a.value.localeCompare(b.value);
    });

    return result;
  },

  compareCodes: function(src, derived) {
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
      src.forEach(code => {
        const c = derived.find(
          x => x.codeSystem === code.codeSystem && x.value === code.value
        );
        if (!c) {
          //code deleted
          codes.changed = true;
          codes.list.push({
            ...code,
            status: "deleted"
          });
        }
      });
    }
    return codes;
  },

  buildSrcCodes: function(valuesets, versions, valuesetsMap, igId) {
    let result = {};
    if (valuesets) {
      valuesets.forEach((valueset, i) => {
        if (
          valuesetsMap[igId][valueset] &&
          valuesetsMap[igId][valueset][versions[i]]
        ) {
          result[valueset] = {
            src: {
              value: valuesetsMap[igId][valueset][versions[i]].children
            },
            derived: {}
          };
        }
      });
    }
    return result;
  },

  extractLocations: function(locations) {
    let locs = [];
    let results = [];
    if (locations) {
      locs = locations.split(",");
      locs.forEach(location => {
        let loc = location.split(".");
        location = loc[loc.length - 1];
        location = parseInt(location);
        results.push(location);
      });
    }
    return results;
  },

  getCodes: function(valueset, valuesetsMap, igId) {
    let result = [];
    if (valueset && valuesetsMap[igId] && valuesetsMap[igId][valueset]) {
      result = valuesetsMap[igId][valueset].children;
    }

    return result;
  },

  extractValuesetsFromName: function(name) {
    let valuesets = [];
    if (name) {
      valuesets = name.split(",");
    }
    return valuesets;
  },
  populateSrcValuesetsValidation: function(
    igId,
    element,
    configuration,
    valuesetsMap
  ) {
    let results = [];
    if (element && element.binding) {
      let binding = element;
      let bindingDifferential = {
        data: {
          locations: {
            src: {
              value: this.extractLocationsValidation(binding.bindingLocation)
            },
            derived: {}
          },
          strength: {
            src: {
              value: this.translateStrength(binding.bindingStrength)
            },
            derived: {}
          },
          valuesets: {
            src: {
              value: this.extractVSValidation(
                binding.binding,
                valuesetsMap,
                igId
              )
            },
            derived: {}
          },

          position: binding.position,
          path: binding.path,

          LocationInfoType: binding.LocationInfoType,

          codes: this.buildSrcCodes(
            binding.valuesets,
            binding.versions,
            valuesetsMap,
            igId
          )
        },
        changed: false
      };
      results.push(bindingDifferential);
    }
    return results;
  },
  extractVSValidation: function(valuesets, valuesetsMap, igId) {
    let result = [];
    if (valuesets) {
      let list = valuesets.split(":");
      list.forEach((valueset, i) => {
        result.push({
          bindingIdentifier: valueset,
          codes: this.getCodes(valueset, valuesetsMap, igId)
        });
      });
    }
    return result;
  },
  compareBindingsValidation: function(
    originalProfile,
    segmentDifferential,
    fieldDifferential,
    derivedField,
    srcIgId,
    derivedIgId,
    valuesetsMap
  ) {
    if (fieldDifferential.data.bindings && fieldDifferential.data.bindings[0]) {
      let bindingDiff = fieldDifferential.data.bindings[0];
      if (derivedField.binding) {
        let strength = this.translateStrength(derivedField.bindingStrength);
        if (bindingDiff.data.strength.src.value !== strength) {
          bindingDiff.changed = true;
          bindingDiff.data.changed = true;

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          const compliance = MetricService.updateBindingMetrics(
            derivedIgId,
            originalProfile,
            "strength"
          );
          bindingDiff.data.strength.derived[derivedIgId] = {
            value: strength,
            compliance
          };
        }

        const derivedLocations = this.extractLocationsValidation(
          derivedField.bindingLocation
        );
        const locationsDiff = _.difference(
          derivedLocations,
          bindingDiff.data.locations.src.value
        );

        if (locationsDiff && locationsDiff.length > 0) {
          if (!bindingDiff.data.locations.derived[derivedIgId]) {
            bindingDiff.changed = true;
            bindingDiff.data.changed = true;
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            const compliance = MetricService.updateBindingMetrics(
              derivedIgId,
              originalProfile,
              "location"
            );
            bindingDiff.data.locations.derived[derivedIgId] = {
              value: derivedLocations,
              compliance
            };
          }
        }

        const valuesets = this.extractVSValidation(
          derivedField.binding,
          valuesetsMap,
          derivedIgId
        );

        valuesets.forEach((valueset, i) => {
          let vs = valueset.bindingIdentifier;

          if (
            valuesetsMap[derivedIgId] &&
            valuesetsMap[derivedIgId][vs] &&
            bindingDiff.data.valuesets.src.value
          ) {
            const srcVs = bindingDiff.data.valuesets.src.value.find(v => {
              return v.bindingIdentifier === vs;
            });

            if (srcVs) {
              // compare codes

              const comparedCodes = this.compareCodes(
                valuesetsMap[srcIgId][srcVs.bindingIdentifier].children,
                valuesetsMap[derivedIgId][vs].children
              );

              let diff = {
                bindingIdentifier: vs,
                status: "unchanged"
              };
              if (comparedCodes.changed) {
                segmentDifferential.changed = true;
                segmentDifferential.data.changed = true;
                bindingDiff.changed = true;
                bindingDiff.data.changed = true;
                bindingDiff.data.showCodes = true;
                fieldDifferential.changed = true;
                fieldDifferential.data.changed = true;
                diff.status = "changed";

                diff.codes = comparedCodes.list;
                const compliance = MetricService.updateBindingMetrics(
                  derivedIgId,
                  originalProfile,
                  "codes"
                );
                if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                  bindingDiff.data.valuesets.derived[derivedIgId] = {
                    value: [],
                    compliance
                  };
                }
                bindingDiff.data.valuesets.derived[derivedIgId].value.push(
                  diff
                );
              } else {
                if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                  bindingDiff.data.valuesets.derived[derivedIgId] = {
                    value: []
                  };
                }
                if (bindingDiff.data.valuesets.derived[derivedIgId])
                  bindingDiff.data.valuesets.derived[derivedIgId].value.push(
                    diff
                  );
              }
            } else {
              // New Value set added to binding
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              bindingDiff.changed = true;
              bindingDiff.data.changed = true;
              bindingDiff.data.showCodes = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                "vs"
              );

              if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                bindingDiff.data.valuesets.derived[derivedIgId] = {
                  value: [],
                  compliance
                };
              }
              bindingDiff.data.valuesets.derived[derivedIgId].value.push({
                bindingIdentifier: vs,
                codes: valuesetsMap[derivedIgId][vs].children,
                status: "added"
              });
            }
          }
        });
        if(bindingDiff.data.valuesets.src.value){
          bindingDiff.data.valuesets.src.value.forEach(valueset => {
            let vs = valuesets.find(v => {
              return v.bindingIdentifier === valueset.bindingIdentifier
            })
            if(!vs){
              //vs removed from binding
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              bindingDiff.changed = true;
              bindingDiff.data.changed = true;
              bindingDiff.data.showCodes = true;
              if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                bindingDiff.data.valuesets.derived[derivedIgId] = {
                  value: [],
                };
              }
              bindingDiff.data.valuesets.derived[derivedIgId].value.push({
                bindingIdentifier: valueset.bindingIdentifier,
                codes: valuesetsMap[srcIgId] ? valuesetsMap[srcIgId][valueset.bindingIdentifier].children : [],
                status: "deleted"
              });
            }
          });
        }

      } else {
        //binding removed
        // TODO: update compliance
        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;

        bindingDiff.changed = true;
        bindingDiff.data.changed = true;
        if (!bindingDiff.data.derived) {
          bindingDiff.data.derived = {};
        }
        bindingDiff.data.derived[derivedIgId] = {
          status: "deleted"
        };
        bindingDiff.data.locations.derived[derivedIgId] = {
          value: bindingDiff.data.locations.src.value,
          status: "deleted"
        };
        bindingDiff.data.strength.derived[derivedIgId] = {
          value: bindingDiff.data.strength.src.value,
          status: "deleted"
        };
        bindingDiff.data.valuesets.derived[derivedIgId] = {
          value: bindingDiff.data.valuesets.src.value,
          status: "deleted"
        };
      }
    } else {
      if (derivedField.binding) {
        // Added binding
        // TODO: update compliance

        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        let newBindingDifferential = {
          data: {
            status: "added",
            showCodes: true,
            changed: true,
            locations: {
              src: {},
              derived: {}
            },
            strength: {
              src: {
                // value: derivedBinding.strength
              },
              derived: {}
            },
            valuesets: {
              src: {},
              derived: {}
            }
            // codes: this.buildSrcCodes(
            //   derivedBinding.valuesets,
            //   derivedBinding.versions,
            //   valuesetsMap,
            //   derivedIgId
            // )
          },
          changed: true
        };

        newBindingDifferential.data.strength.derived[derivedIgId] = {
          value: this.translateStrength(derivedField.bindingStrength)
        };
        newBindingDifferential.data.locations.derived[derivedIgId] = {
          value: this.extractLocationsValidation(derivedField.bindingLocation)
        };
        newBindingDifferential.data.valuesets.derived[derivedIgId] = {
          value: this.extractVSValidation(
            derivedField.binding,
            valuesetsMap,
            derivedIgId
          )
        };
        if (!fieldDifferential.data.bindings) {
          fieldDifferential.data.bindings = [];
        }
        fieldDifferential.data.bindings.push(newBindingDifferential);
      }
    }
  },
  extractLocationsValidation: function(locations) {
    let locs = [];
    let results = [];
    if (locations) {
      locs = locations.split(":");
      locs.forEach(location => {
        location = parseInt(location);
        results.push(location);
      });
    }
    return results;
  },
  translateStrength(strength) {
    let res = "";
    if (strength) {
      switch (strength) {
        case "S":
          res = "Suggested";
          break;
        case "R":
          res = "Required";
          break;
        case "U":
          res = "Unspecified";
          break;
      }
    }
    return res;
  }
};

module.exports = ValuesetService;
