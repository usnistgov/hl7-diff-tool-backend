const _ = require('underscore');
const MetricService = require('../metricService');

let ValuesetService = {
  populateValuesetsMap: function (valuesetsMap, igId, valuesets) {
    if (valuesets) {
      if (!valuesetsMap[igId]) {
        valuesetsMap[igId] = {};
      }
      valuesets.forEach((valueset) => {
        const bindingId = valueset['$'].BindingIdentifier;
        if (!valuesetsMap[igId][bindingId]) {
          valuesetsMap[igId][bindingId] = {};
        }

        valuesetsMap[igId][bindingId] =
          this.extractValueset(valueset);
      });
    }
  },
  extractValueset: function (valueset) {
    let result = {};
    if (valueset) {
      //TODO: check rest of fields
      result = {
        id: valueset['$'].id,
        title: valueset['$'].title,
        name: valueset['$'].Name,
        description: valueset['$'].Description,
        bindingIdentifier: valueset['$'].BindingIdentifier,
        codeSystemIds: valueset['$'].codeSystemIds,
        contentDefinition: valueset['$'].ContentDefinition,
        extensibility: valueset['$'].Extensibility,
        numberOfCodes: valueset['$'].numberOfCodes,
        oid: valueset['$'].oid,
        stability: valueset['$'].Stability,
        version: valueset['$'].Version,
        children: this.extractCodes(valueset.ValueElement),
      };
    }

    return result;
  },
  extractCodes: function (codes) {
    let result = [];
    if (codes) {
      codes.forEach((code) => {
        result.push({
          value: code['$'].Value,
          usage: code['$'].Usage,
          displayName: code['$'].DisplayName,
          codeSystem: code['$'].CodeSystem,
        });
      });
    }
    result = result.sort(function (a, b) {
      return a.value.localeCompare(b.value);
    });

    return result;
  },

  compareCodes: function (src, derived) {
    let codes = {
      changed: false,
      list: [],
    };
    if (derived) {
      derived.forEach((code) => {
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
  buildNewSrcCodes: function (bindings, valuesetsMap, igId) {
    let result = {};
    if (bindings) {
      bindings.Binding.forEach((binding) => {
        const vs = binding['$'].BindingIdentifier;

        if (valuesetsMap[igId][vs]) {
          result[vs] = {
            src: {
              value: valuesetsMap[igId][vs].children,
            },
            derived: {},
          };
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

  getCodes: function (valueset, valuesetsMap, igId) {
    let result = [];
    if (
      valueset &&
      valuesetsMap[igId] &&
      valuesetsMap[igId][valueset]
    ) {
      result = valuesetsMap[igId][valueset].children;
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
  populateSrcValuesetsValidation: function (
    igId,
    element,
    configuration,
    valuesetsMap,
    valuesetBindings,
    currentPath,
    parentRef,
    parentType
  ) {
    let results = [];
    if (element && element.binding) {
      let binding = element;
      let bindingDifferential = {
        data: {
          locations: {
            src: {
              value: this.extractLocationsValidation(
                binding.bindingLocation
              ),
            },
            derived: {},
          },
          strength: {
            src: {
              value: this.translateStrength(binding.bindingStrength),
            },
            derived: {},
          },
          valuesets: {
            src: {
              value: this.extractVSValidation(
                binding.binding,
                valuesetsMap,
                igId
              ),
            },
            derived: {},
          },

          position: binding.position,
          path: binding.path,

          LocationInfoType: binding.LocationInfoType,

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
    }
    // find the correct binding from 'valuesetBindings' based on segment or datatype

    const parentId = parentRef.split(' ')[0];
    if (parentId) {
      let mapName = '';
      if (parentType === 'segment') {
        mapName = 'segmentsMap';
      } else if (parentType === 'datatype') {
        mapName = 'datatypesMap';
      }

      if (
        valuesetBindings &&
        valuesetBindings[mapName] &&
        valuesetBindings[mapName][parentId]
      ) {
        const binding = valuesetBindings[mapName][parentId].find(
          (binding) => {
            const target = binding.target.split('[')[0];
            return target === element.position;
          }
        );

        if (binding) {
          let bindingDifferential = {
            data: {
              locations: {
                src: {
                  value: this.extractLocationsNewValidation(
                    binding.bindingLocations
                  ),
                },
                derived: {},
              },
              strength: {
                src: {
                  value: this.translateStrength(
                    binding.bindingStrength
                  ),
                },
                derived: {},
              },
              valuesets: {
                src: {
                  value: this.extractVSNewValidation(
                    binding.bindings,
                    valuesetsMap,
                    igId
                  ),
                },
                derived: {},
              },

              position: binding.position,
              path: binding.path,

              LocationInfoType: binding.LocationInfoType,

              codes: this.buildNewSrcCodes(
                binding.bindings,
                valuesetsMap,
                igId
              ),
            },
            changed: false,
          };

          results.push(bindingDifferential);
        }
      }
    }

    return results;
  },
  extractVSValidation: function (valuesets, valuesetsMap, igId) {
    let result = [];
    if (valuesets) {
      let list = valuesets.split(':');
      list.forEach((valueset, i) => {
        result.push({
          bindingIdentifier: valueset,
          codes: this.getCodes(valueset, valuesetsMap, igId),
        });
      });
    }
    return result;
  },
  extractVSNewValidation: function (bindings, valuesetsMap, igId) {
    let result = [];
    if (bindings && bindings.Binding) {
      bindings.Binding.forEach((binding) => {
        result.push({
          bindingIdentifier: binding['$'].BindingIdentifier,
          codes: this.getCodes(
            binding['$'].BindingIdentifier,
            valuesetsMap,
            igId
          ),
        });
      });
    }
    return result;
  },
  compareBindingsValidation: function (
    originalProfile,
    segmentDifferential,
    fieldDifferential,
    derivedField,
    srcIgId,
    derivedIgId,
    valuesetsMap,
    valuesetBindings,
    derivedParentLabel,
    parentType
  ) {
    let mapName = '';
    if (parentType === 'segment') {
      mapName = 'segmentsMap';
    } else if (parentType === 'datatype') {
      mapName = 'datatypesMap';
    }
    let parentRef = derivedParentLabel.split(' ')[0];

    if (
      fieldDifferential.data.bindings &&
      fieldDifferential.data.bindings[0]
    ) {
      let bindingDiff = fieldDifferential.data.bindings[0];
      let isBindingRemoved = false;
      let derivedBindingFound = false;

      if (derivedField.binding) {
        derivedBindingFound = true;
        let strength = this.translateStrength(
          derivedField.bindingStrength
        );

        if (bindingDiff.data.strength.src.value !== strength) {
          bindingDiff.changed = true;
          bindingDiff.data.changed = true;

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('valueset');

          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('valueset');

          const compliance = MetricService.updateBindingMetrics(
            derivedIgId,
            originalProfile,
            'strength'
          );
          bindingDiff.data.strength.derived[derivedIgId] = {
            value: strength,
            compliance,
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
            segmentDifferential.data.changeTypes.push('valueset');

            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            fieldDifferential.data.changeTypes.push('valueset');

            const compliance = MetricService.updateBindingMetrics(
              derivedIgId,
              originalProfile,
              'location'
            );
            bindingDiff.data.locations.derived[derivedIgId] = {
              value: derivedLocations,
              compliance,
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
            const srcVs = bindingDiff.data.valuesets.src.value.find(
              (v) => {
                return v.bindingIdentifier === vs;
              }
            );

            if (srcVs) {
              // compare codes

              const comparedCodes = this.compareCodes(
                valuesetsMap[srcIgId][srcVs.bindingIdentifier]
                  .children,
                valuesetsMap[derivedIgId][vs].children
              );

              let diff = {
                bindingIdentifier: vs,
                status: 'unchanged',
              };
              if (comparedCodes.changed) {
                segmentDifferential.changed = true;
                segmentDifferential.data.changed = true;
                segmentDifferential.data.changeTypes.push('valueset');

                bindingDiff.changed = true;
                bindingDiff.data.changed = true;
                bindingDiff.data.showCodes = true;
                if (!bindingDiff.data.igs) {
                  bindingDiff.data.igs = {};
                }
                bindingDiff.data.igs[derivedIgId] = {
                  showCodes: true,
                  status: 'changed',
                };
                fieldDifferential.changed = true;
                fieldDifferential.data.changed = true;
                fieldDifferential.data.changeTypes.push('valueset');

                diff.status = 'changed';

                diff.codes = comparedCodes.list;
                const compliance = MetricService.updateBindingMetrics(
                  derivedIgId,
                  originalProfile,
                  'codes'
                );
                if (
                  !bindingDiff.data.valuesets.derived[derivedIgId]
                ) {
                  bindingDiff.data.valuesets.derived[derivedIgId] = {
                    value: [],
                    compliance,
                  };
                }
                bindingDiff.data.valuesets.derived[
                  derivedIgId
                ].value.push(diff);
              } else {
                if (
                  !bindingDiff.data.valuesets.derived[derivedIgId]
                ) {
                  bindingDiff.data.valuesets.derived[derivedIgId] = {
                    value: [],
                  };
                }
                if (bindingDiff.data.valuesets.derived[derivedIgId])
                  bindingDiff.data.valuesets.derived[
                    derivedIgId
                  ].value.push(diff);
              }
            } else {
              // New Value set added to binding
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              segmentDifferential.data.changeTypes.push('valueset');

              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              fieldDifferential.data.changeTypes.push('valueset');

              bindingDiff.changed = true;
              bindingDiff.data.changed = true;
              bindingDiff.data.showCodes = true;
              if (!bindingDiff.data.igs) {
                bindingDiff.data.igs = {};
              }
              bindingDiff.data.igs[derivedIgId] = {
                showCodes: true,
                status: 'added',
              };
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                'vs'
              );

              if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                bindingDiff.data.valuesets.derived[derivedIgId] = {
                  value: [],
                  compliance,
                };
              }
              bindingDiff.data.valuesets.derived[
                derivedIgId
              ].value.push({
                bindingIdentifier: vs,
                codes: valuesetsMap[derivedIgId][vs].children,
                status: 'added',
              });
            }
          }
        });
        if (bindingDiff.data.valuesets.src.value) {
          bindingDiff.data.valuesets.src.value.forEach((valueset) => {
            let vs = valuesets.find((v) => {
              return (
                v.bindingIdentifier === valueset.bindingIdentifier
              );
            });
            if (!vs) {
              //vs removed from binding
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              segmentDifferential.data.changeTypes.push('valueset');

              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              fieldDifferential.data.changeTypes.push('valueset');

              bindingDiff.changed = true;
              bindingDiff.data.changed = true;
              bindingDiff.data.showCodes = true;
              if (!bindingDiff.data.igs) {
                bindingDiff.data.igs = {};
              }
              bindingDiff.data.igs[derivedIgId] = {
                showCodes: true,
                status: 'deleted',
              };
              if (!bindingDiff.data.valuesets.derived[derivedIgId]) {
                bindingDiff.data.valuesets.derived[derivedIgId] = {
                  value: [],
                };
              }

              bindingDiff.data.valuesets.derived[
                derivedIgId
              ].value.push({
                bindingIdentifier: valueset.bindingIdentifier,
                codes: valuesetsMap[srcIgId]
                  ? valuesetsMap[srcIgId][valueset.bindingIdentifier]
                      .children
                  : [],
                status: 'deleted',
              });
            }
          });
        }
      } else {
        //binding removed
        isBindingRemoved = true;
      }

      // Logic for When the bindings are in a seperate file and not in the Profile
      // if (fieldDifferential.data.type === 'field') {

      if (valuesetBindings[mapName][parentRef]) {
        const binding = valuesetBindings[mapName][parentRef].find(
          (b) => {
            const position = b.target.split('[')[0];
            return position === fieldDifferential.data.position;
          }
        );

        if (binding) {
          // binding found in new xml
          derivedBindingFound = true;

          let strength = this.translateStrength(
            binding.bindingStrength
          );
          if (bindingDiff.data.strength.src.value !== strength) {
            bindingDiff.changed = true;
            bindingDiff.data.changed = true;

            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            fieldDifferential.data.changeTypes.push('valueset');

            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            segmentDifferential.data.changeTypes.push('valueset');

            const compliance = MetricService.updateBindingMetrics(
              derivedIgId,
              originalProfile,
              'strength'
            );
            bindingDiff.data.strength.derived[derivedIgId] = {
              value: strength,
              compliance,
            };
          }

          const derivedLocations = this.extractLocationsNewValidation(
            binding.bindingLocations
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
              segmentDifferential.data.changeTypes.push('valueset');

              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              fieldDifferential.data.changeTypes.push('valueset');

              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                'location'
              );
              bindingDiff.data.locations.derived[derivedIgId] = {
                value: derivedLocations,
                compliance,
              };
            }
          }

          const valuesets = this.extractVSNewValidation(
            binding.bindings,
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
              const srcVs = bindingDiff.data.valuesets.src.value.find(
                (v) => {
                  return v.bindingIdentifier === vs;
                }
              );

              if (srcVs) {
                // compare codes

                const comparedCodes = this.compareCodes(
                  valuesetsMap[srcIgId][srcVs.bindingIdentifier]
                    .children,
                  valuesetsMap[derivedIgId][vs].children
                );

                let diff = {
                  bindingIdentifier: vs,
                  status: 'unchanged',
                };
                if (comparedCodes.changed) {
                  segmentDifferential.changed = true;
                  segmentDifferential.data.changed = true;
                  segmentDifferential.data.changeTypes.push(
                    'valueset'
                  );

                  bindingDiff.changed = true;
                  bindingDiff.data.changed = true;
                  bindingDiff.data.showCodes = true;
                  if (!bindingDiff.data.igs) {
                    bindingDiff.data.igs = {};
                  }
                  bindingDiff.data.igs[derivedIgId] = {
                    showCodes: true,
                    status: 'changed',
                  };
                  fieldDifferential.changed = true;
                  fieldDifferential.data.changed = true;
                  fieldDifferential.data.changeTypes.push('valueset');

                  diff.status = 'changed';

                  diff.codes = comparedCodes.list;
                  const compliance =
                    MetricService.updateBindingMetrics(
                      derivedIgId,
                      originalProfile,
                      'codes'
                    );
                  if (
                    !bindingDiff.data.valuesets.derived[derivedIgId]
                  ) {
                    bindingDiff.data.valuesets.derived[derivedIgId] =
                      {
                        value: [],
                        compliance,
                      };
                  }
                  bindingDiff.data.valuesets.derived[
                    derivedIgId
                  ].value.push(diff);
                } else {
                  if (
                    !bindingDiff.data.valuesets.derived[derivedIgId]
                  ) {
                    bindingDiff.data.valuesets.derived[derivedIgId] =
                      {
                        value: [],
                      };
                  }
                  if (bindingDiff.data.valuesets.derived[derivedIgId])
                    bindingDiff.data.valuesets.derived[
                      derivedIgId
                    ].value.push(diff);
                }
              } else {
                // New Value set added to binding
                segmentDifferential.changed = true;
                segmentDifferential.data.changed = true;
                segmentDifferential.data.changeTypes.push('valueset');

                fieldDifferential.changed = true;
                fieldDifferential.data.changed = true;
                fieldDifferential.data.changeTypes.push('valueset');

                bindingDiff.changed = true;
                bindingDiff.data.changed = true;
                bindingDiff.data.showCodes = true;
                if (!bindingDiff.data.igs) {
                  bindingDiff.data.igs = {};
                }
                bindingDiff.data.igs[derivedIgId] = {
                  showCodes: true,
                  status: 'added',
                };
                const compliance = MetricService.updateBindingMetrics(
                  derivedIgId,
                  originalProfile,
                  'vs'
                );

                if (
                  !bindingDiff.data.valuesets.derived[derivedIgId]
                ) {
                  bindingDiff.data.valuesets.derived[derivedIgId] = {
                    value: [],
                    compliance,
                  };
                }
                bindingDiff.data.valuesets.derived[
                  derivedIgId
                ].value.push({
                  bindingIdentifier: vs,
                  codes: valuesetsMap[derivedIgId][vs].children,
                  status: 'added',
                });
              }
            }
          });
          if (bindingDiff.data.valuesets.src.value) {
            bindingDiff.data.valuesets.src.value.forEach(
              (valueset) => {
                let vs = valuesets.find((v) => {
                  return (
                    v.bindingIdentifier === valueset.bindingIdentifier
                  );
                });
                if (!vs) {
                  //vs removed from binding
                  segmentDifferential.changed = true;
                  segmentDifferential.data.changed = true;
                  segmentDifferential.data.changeTypes.push(
                    'valueset'
                  );

                  fieldDifferential.changed = true;
                  fieldDifferential.data.changed = true;
                  fieldDifferential.data.changeTypes.push('valueset');

                  bindingDiff.changed = true;
                  bindingDiff.data.changed = true;
                  bindingDiff.data.showCodes = true;
                  if (!bindingDiff.data.igs) {
                    bindingDiff.data.igs = {};
                  }
                  bindingDiff.data.igs[derivedIgId] = {
                    showCodes: true,
                    status: 'deleted',
                  };
                  if (
                    !bindingDiff.data.valuesets.derived[derivedIgId]
                  ) {
                    bindingDiff.data.valuesets.derived[derivedIgId] =
                      {
                        value: [],
                      };
                  }

                  bindingDiff.data.valuesets.derived[
                    derivedIgId
                  ].value.push({
                    bindingIdentifier: valueset.bindingIdentifier,
                    codes: valuesetsMap[srcIgId]
                      ? valuesetsMap[srcIgId][
                          valueset.bindingIdentifier
                        ].children
                      : [],
                    status: 'deleted',
                  });
                }
              }
            );
          }
        } else {
          isBindingRemoved = true;
        }
      } else {
        isBindingRemoved = true;
      }
      // }

      if (isBindingRemoved && !derivedBindingFound) {
        //binding removed
        // TODO: update compliance
        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        segmentDifferential.data.changeTypes.push('valueset');

        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        fieldDifferential.data.changeTypes.push('valueset');

        bindingDiff.changed = true;
        bindingDiff.data.changed = true;
        if (!bindingDiff.data.derived) {
          bindingDiff.data.derived = {};
        }
        bindingDiff.data.derived[derivedIgId] = {
          status: 'deleted',
        };
        bindingDiff.data.locations.derived[derivedIgId] = {
          value: bindingDiff.data.locations.src.value,
          status: 'deleted',
        };
        bindingDiff.data.strength.derived[derivedIgId] = {
          value: bindingDiff.data.strength.src.value,
          status: 'deleted',
        };
        bindingDiff.data.valuesets.derived[derivedIgId] = {
          value: bindingDiff.data.valuesets.src.value,
          status: 'deleted',
        };
      }
    } else {
      if (derivedField.binding) {
        // Added binding
        // TODO: update compliance

        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        segmentDifferential.data.changeTypes.push('valueset');

        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        fieldDifferential.data.changeTypes.push('valueset');

        let newBindingDifferential = {
          data: {
            status: 'added',
            showCodes: true,
            changed: true,
            locations: {
              src: {},
              derived: {},
            },
            strength: {
              src: {
                // value: derivedBinding.strength
              },
              derived: {},
            },
            valuesets: {
              src: {},
              derived: {},
            },
            // codes: this.buildSrcCodes(
            //   derivedBinding.valuesets,
            //   derivedBinding.versions,
            //   valuesetsMap,
            //   derivedIgId
            // )
          },
          changed: true,
        };
        if (!newBindingDifferential.data.igs) {
          newBindingDifferential.data.igs = {};
        }
        newBindingDifferential.data.igs[derivedIgId] = {
          showCodes: true,
          status: 'added',
        };
        newBindingDifferential.data.strength.derived[derivedIgId] = {
          value: this.translateStrength(derivedField.bindingStrength),
        };
        newBindingDifferential.data.locations.derived[derivedIgId] = {
          value: this.extractLocationsValidation(
            derivedField.bindingLocation
          ),
        };
        newBindingDifferential.data.valuesets.derived[derivedIgId] = {
          value: this.extractVSValidation(
            derivedField.binding,
            valuesetsMap,
            derivedIgId
          ),
        };
        if (!fieldDifferential.data.bindings) {
          fieldDifferential.data.bindings = [];
        }
        fieldDifferential.data.bindings.push(newBindingDifferential);
      }
      // add logic for When the bindings are in a seperate file and not in the Profile
      // if (fieldDifferential.data.type === 'field') {
      if (valuesetBindings[mapName][parentRef]) {
        const binding = valuesetBindings[mapName][parentRef].find(
          (b) => {
            const position = b.target.split('[')[0];
            return position === fieldDifferential.data.position;
          }
        );
        if (binding) {
          // Added binding
          const vsbinding = binding;
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('valueset');

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('valueset');
          let newBindingDifferential = {
            data: {
              status: 'added',
              showCodes: true,
              changed: true,
              locations: {
                src: {},
                derived: {},
              },
              strength: {
                src: {},
                derived: {},
              },
              valuesets: {
                src: {},
                derived: {},
              },
            },
            changed: true,
          };
          if (!newBindingDifferential.data.igs) {
            newBindingDifferential.data.igs = {};
          }
          newBindingDifferential.data.igs[derivedIgId] = {
            showCodes: true,
            status: 'added',
          };
          newBindingDifferential.data.strength.derived[derivedIgId] =
            {
              value: this.translateStrength(
                vsbinding.bindingStrength
              ),
            };
          newBindingDifferential.data.locations.derived[derivedIgId] =
            {
              value: this.extractLocationsNewValidation(
                vsbinding.bindingLocations
              ),
            };
          newBindingDifferential.data.valuesets.derived[derivedIgId] =
            {
              value: this.extractVSNewValidation(
                vsbinding.bindings,
                valuesetsMap,
                derivedIgId
              ),
            };
          if (!fieldDifferential.data.bindings) {
            fieldDifferential.data.bindings = [];
          }
          fieldDifferential.data.bindings.push(
            newBindingDifferential
          );
        }
      }
      // }
    }
  },
  extractLocationsValidation: function (locations) {
    let locs = [];
    let results = [];
    if (locations) {
      locs = locations.split(':');
      locs.forEach((location) => {
        location = parseInt(location);
        results.push(location);
      });
    }
    return results;
  },
  extractLocationsNewValidation: function (locations) {
    let results = [];
    if (locations.ComplexBindingLocation) {
      locations.ComplexBindingLocation.forEach((location) => {
        let loc = location['$'].CodeLocation.split('[')[0];
        loc = parseInt(loc);
        results.push(loc);
      });
    }
    if (locations.SimpleBindingLocation) {
      locations.SimpleBindingLocation.forEach((location) => {
        let loc = location['$'].CodeLocation;
        // NEW TODO: ask what to do with .
      });
    }

    return results;
  },
  translateStrength(strength) {
    let res = '';
    if (strength) {
      switch (strength) {
        case 'S':
          res = 'Suggested';
          break;
        case 'R':
          res = 'Required';
          break;
        case 'U':
          res = 'Unspecified';
          break;
      }
    }
    return res;
  },
};

module.exports = ValuesetService;
