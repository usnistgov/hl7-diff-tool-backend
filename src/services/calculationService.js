const ProfileService = require("./profileService");
const ComparisonService = require("./comparisonService");
const SegmentService = require("./segmentService");
const ValuesetService = require("./valuesetService");

const DatatypeService = require("./datatypeService");
const globalConfigs = require("../../config/global");
const _ = require("underscore");

let CalculationService = {
  calculate: function(sourceProfile, derivedIgs, configuration) {
    const res = this.createDifferential(
      sourceProfile,
      derivedIgs,
      configuration
    );
    // return sourceProfile.valuesets
    return res;
  },
  createDifferential(sourceProfile, derivedIgs, configuration) {
    let configRes = [];
    for (const conf in configuration) {
      if (configuration[conf]) {
        configRes.push({
          name: conf,
          label: globalConfigs.configLabels[conf]
        });
      }
    }
    let results = {
      profiles: [],
      srcIg: {
        title: sourceProfile.ig,
        id: sourceProfile.id
      },
      derivedIgs: [],
      configuration: [
        ...configRes,
        {
          name: "label",
          label: "Segment Ref."
        }
      ],
      segments: []
    };
    let segmentsMap = {};
    SegmentService.populateSegmentsMap(
      segmentsMap,
      sourceProfile.id,
      sourceProfile.segments
    );

    let datatypesMap = {};
    DatatypeService.populateDatatypesMap(
      datatypesMap,
      sourceProfile.id,
      sourceProfile.datatypes
    );

    let valuesetsMap = {};
    ValuesetService.populateValuesetsMap(
      valuesetsMap,
      sourceProfile.id,
      sourceProfile.valuesets
    );
    if (sourceProfile.profiles) {
      sourceProfile.profiles.forEach(profile => {
        results.profiles.push({
          data: {
            name: profile["$"].name,
            description: profile["$"].description,
            title: profile["$"].title,
            id: profile["$"].id
          },
          children: this.populateProfileChildren(profile.ConformanceProfile[0]),
          segmentRefs: this.populateProfileSegments(
            profile.ConformanceProfile[0],
            "",
            segmentsMap,
            configuration,
            sourceProfile.id,
            datatypesMap,
            valuesetsMap
          )
        });
      });
    }

    if (derivedIgs) {
      derivedIgs.forEach(derivedIg => {
        SegmentService.populateSegmentsMap(
          segmentsMap,
          derivedIg.id,
          derivedIg.segments
        );
        DatatypeService.populateDatatypesMap(
          datatypesMap,
          derivedIg.id,
          derivedIg.datatypes
        );
        ValuesetService.populateValuesetsMap(
          valuesetsMap,
          derivedIg.id,
          derivedIg.valuesets
        );

        results.derivedIgs.push({
          title: derivedIg.ig,
          id: derivedIg.id
        });
        this.createProfilesDiff(
          results,
          derivedIg,
          configuration,
          segmentsMap,
          datatypesMap,
          valuesetsMap
        );
      });
    }
    results.profiles.forEach(profile => {
      profile.segmentRefs.forEach(segmentRef => {
        let child = this.getDataByPath(
          profile.children,
          segmentRef.data.path,
          segmentRef.changed
        );
        this.spreadBindings(segmentRef.children, segmentRef.bindings);

        child.children = segmentRef.children;
        child.bindings = segmentRef.bindings;
        child.changed = segmentRef.changed;
      });
    });

    return results;
  },
  spreadBindings(fields, bindings) {
    bindings.forEach(binding => {
      if (binding.data.LocationInfoType === "FIELD") {
        let field = fields.find(f => f.data.position === binding.data.position);
        if (field) {
          if (!field.data.bindings) {
            field.data.bindings = [];
          }
          field.data.bindings.push(binding);
        }
      }
    });
  },
  getDataByPath(data, path, changed) {
    const paths = path.split(".");

    if (paths.length < 2) {
      const result = data.find(
        d => d.data.position.toString() === paths[0].toString()
      );
      return result;
    } else {
      const newData = data.find(d => d.data.position === path[0]);
      paths.shift();
      if (newData && newData.children) {
        newData.changed = changed;
        return this.getDataByPath(newData.children, paths.join("."), changed);
      }
    }
  },
  populateProfileSegments(
    profile,
    currentPath,
    segmentsMap,
    configuration,
    igId,
    datatypesMap,
    valuesetsMap
  ) {
    let res = [];
    if (profile) {
      if (profile.SegmentRef) {
        res.push(
          ...this.extractSegmentFromSegRefs(
            profile.SegmentRef,
            currentPath,
            segmentsMap,
            configuration,
            igId,
            datatypesMap,
            valuesetsMap
          )
        );
      }
      if (profile.Group) {
        res.push(
          ...this.extractSegmentFromGroups(
            profile.Group,
            currentPath,
            segmentsMap,
            configuration,
            igId,
            datatypesMap,
            valuesetsMap
          )
        );
      }
    }

    return res;
  },
  extractSegmentFromSegRefs(
    segRefs,
    currentPath,
    segmentsMap,
    configuration,
    igId,
    datatypesMap,
    valuesetsMap
  ) {
    let res = [];
    segRefs.forEach(segRef => {
      let path = currentPath;
      if (path == "") {
        path += segRef["$"].position;
      } else {
        path += `.${segRef["$"].position}`;
      }

      res.push({
        data: {
          position: segRef["$"].position,
          name: segRef["$"].name,
          path: path,
          ref: segRef["$"].ref,
          idSeg: segRef["$"].iDSeg,
          label: {
            src: { value: segRef["$"].label },
            derived: {}
          },
          description: {
            src: { value: segRef["$"].description },
            derived: {}
          }
        },
        changed: false,
        children: [
          ...this.populateSrcFields(
            igId,
            segmentsMap[igId][segRef["$"].iDSeg].children,
            configuration,
            path,
            datatypesMap,
            valuesetsMap
          )
        ],
        bindings: [
          ...this.populateSrcValuesets(
            igId,
            segmentsMap[igId][segRef["$"].iDSeg].bindings,
            configuration,
            path,
            datatypesMap,
            valuesetsMap
          )
        ]
      });
    });
    return res;
  },

  populateSrcValuesets(
    igId,
    bindings,
    configuration,
    path,
    datatypesMap,
    valuesetsMap
  ) {
    let results = [];
    if (bindings && configuration.valueset) {
      bindings.forEach(binding => {
        let bindingDifferential = {
          data: {
            position: binding.position,
            bindingLocation: binding.bindingLocation,
            locations: binding.locations,
            LocationInfoType: binding.LocationInfoType,
            strength: {
              src: {
                value: binding.strength
              },
              derived: {}
            },
            valuesets: {
              src: {
                value: binding.valuesets
              },
              derived: {}
            },
            codes: this.buildSrcCodes(binding.valuesets, valuesetsMap, igId)
          },
          changed: false
        };
        results.push(bindingDifferential);
      });
    }

    return results;
  },
  buildSrcCodes(valuesets, valuesetsMap, igId) {
    let result = {};
    if (valuesets) {
      valuesets.forEach(valueset => {
        if (valuesetsMap[igId][valueset]) {
          result[valueset] = {
            src: {
              value: valuesetsMap[igId][valueset].children
            },
            derived: {}
          };
        }
      });
    }
    return result;
  },
  populateSrcFields(
    igId,
    fields,
    configuration,
    path,
    datatypesMap,
    valuesetsMap
  ) {
    let results = [];
    fields.forEach(field => {
      let currentPath = path;
      currentPath += `.${field.position}`;
      let fieldDifferential = {
        data: {
          name: field.name,
          position: field.position,
          type: "field",
          path: currentPath
        },
        changed: false
      };

      if (configuration.usage) {
        fieldDifferential.data.usage = {
          src: {
            value: field.usage
          },
          derived: {}
        };
      }
      if (configuration.datatype) {
        fieldDifferential.data.datatype = {
          src: {
            value: field.datatype
          },
          derived: {}
        };
      }

      if (
        datatypesMap[igId][field.datatype].children &&
        datatypesMap[igId][field.datatype].children.length > 0
      ) {
        fieldDifferential.children = this.populateSrcDatatypes(
          igId,
          datatypesMap[igId][field.datatype].children,
          configuration,
          currentPath,
          datatypesMap,
          1
        );
      }

      if (configuration.valueset) {
      }

      results.push(fieldDifferential);
    });
    return results;
  },
  populateSrcDatatypes(
    igId,
    components,
    configuration,
    path,
    datatypesMap,
    level
  ) {
    let results = [];
    components.forEach(component => {
      let currentPath = path;
      currentPath += `.${component.position}`;
      let componentDifferential = {
        data: {
          name: component.name,
          position: component.position,
          type: level === 1 ? "component" : "subcomponent",
          path: currentPath
        },
        changed: false
      };

      if (configuration.usage) {
        componentDifferential.data.usage = {
          src: {
            value: component.usage
          },
          derived: {}
        };
      }
      if (configuration.datatype) {
        componentDifferential.data.datatype = {
          src: {
            value: component.datatype
          },
          derived: {}
        };
      }
      if (
        datatypesMap[igId][component.datatype].children &&
        datatypesMap[igId][component.datatype].children.length > 0
      ) {
        componentDifferential.children = this.populateSrcDatatypes(
          igId,
          datatypesMap[igId][component.datatype].children,
          configuration,
          currentPath,
          datatypesMap,
          2
        );
      }

      results.push(componentDifferential);
    });
    results.sort(function(a, b) {
      return a.data.position - b.data.position;
    });
    return results;
  },
  extractSegmentFromGroups(
    groups,
    currentPath,
    segmentsMap,
    configuration,
    igId,
    datatypesMap,
    valuesetsMap
  ) {
    let res = [];
    if (groups) {
      groups = JSON.parse(JSON.stringify(groups));

      groups.forEach(group => {
        if (!group["$"].usage) {
          const length = group.SegmentRef.length;
          const usage = group.SegmentRef[0]["$"].usage;
          group["$"].usage = usage;
          group.SegmentRef.splice(length - 1, 1);
          group.SegmentRef.splice(0, 1);
        }

        let path = currentPath;
        if (path == "") {
          path += group["$"].position;
        } else {
          path += `.${group["$"].position}`;
        }

        res.push(
          ...this.populateProfileSegments(
            group,
            path,
            segmentsMap,
            configuration,
            igId,
            datatypesMap,
            valuesetsMap
          )
        );
      });
    }
    return res;
  },
  populateProfileChildren(profile) {
    let res = [];
    if (profile) {
      if (profile.SegmentRef) {
        res.push(...this.populateSegRefs(profile.SegmentRef));
      }
      if (profile.Group) {
        res.push(...this.populateGroups(profile.Group));
      }
    }
    res.sort(function(a, b) {
      return a.data.position - b.data.position;
    });
    return res;
  },
  populateSegRefs(segRefs) {
    let res = [];
    segRefs.forEach(segRef => {
      res.push({
        data: {
          position: segRef["$"].position,
          ref: segRef["$"].ref,
          idSeg: segRef["$"].iDSeg,
          label: { src: { value: segRef["$"].label } },
          description: segRef["$"].description,
          usage: {
            src: { value: segRef["$"].usage }
          },
          cardinality: {
            src: { value: this.createCard(segRef["$"].min, segRef["$"].max) }
          },
          min: {
            src: { value: segRef["$"].min }
          },
          max: {
            src: { value: segRef["$"].max }
          },
          type: "segmentRef"
        },
        changed: false
      });
    });
    return res;
  },
  populateGroups(groups) {
    let res = [];
    if (groups) {
      groups = JSON.parse(JSON.stringify(groups));

      groups.forEach(group => {
        const length = group.SegmentRef.length;
        const usage = group.SegmentRef[0]["$"].usage;
        group["$"].usage = usage;
        group.SegmentRef.splice(length - 1, 1);
        group.SegmentRef.splice(0, 1);
        res.push({
          data: {
            position: group["$"].position,
            name: group["$"].name,
            usage: {
              src: { value: group["$"].usage }
            },
            cardinality: {
              src: { value: this.createCard(group["$"].min, group["$"].max) }
            },
            min: {
              src: { value: group["$"].min }
            },
            max: {
              src: { value: group["$"].max }
            },
            type: "group"
          },
          changed: false,
          children: this.populateProfileChildren(group)
        });
      });
    }
    return res;
  },
  createProfilesDiff(
    diff,
    derivedIg,
    configuration,
    segmentsMap,
    datatypesMap,
    valuesetsMap
  ) {
    if (derivedIg.profiles) {
      derivedIg.profiles.forEach(profile => {
        const confProfile = profile.ConformanceProfile[0];
        if (confProfile) {
          const originalProfileId = confProfile["$"].origin;

          const originalProfile = diff.profiles.find(
            p => p.data.id === originalProfileId
          );
          if (originalProfile) {
            this.createProfileDiff(
              derivedIg.id,
              originalProfile,
              confProfile,
              configuration
            );

            this.createProfileSegmentsDiff(
              diff,
              derivedIg.id,
              originalProfile,
              confProfile,
              configuration,
              segmentsMap,
              datatypesMap,
              valuesetsMap
            );

            originalProfile.segmentRefs = originalProfile.segmentRefs.filter(
              s => s.changed
            );
          } else {
            // Can't compare
          }
        }
      });
    }
  },
  createProfileSegmentsDiff(
    differential,
    derivedIgId,
    originalProfile,
    derivedProfile,
    configuration,
    segmentsMap,
    datatypesMap,
    valuesetsMap
  ) {
    let segmentRefs = [];
    if (originalProfile) {
      if (derivedProfile.SegmentRef) {
        segmentRefs.push(
          ...this.extractSegmentFromSegRefs(
            derivedProfile.SegmentRef,
            "",
            segmentsMap,
            configuration,
            derivedIgId,
            datatypesMap,
            valuesetsMap
          )
        );
      }
      if (derivedProfile.Group) {
        segmentRefs.push(
          ...this.extractSegmentFromGroups(
            derivedProfile.Group,
            "",
            segmentsMap,
            configuration,
            derivedIgId,
            datatypesMap,
            valuesetsMap
          )
        );
      }

      segmentRefs.forEach(segmentRef => {
        const sourceSegment = originalProfile.segmentRefs.find(s => {
          return s.data.path === segmentRef.data.path;
        });

        if (sourceSegment) {
          // compare sourceSegment.data.idSeg && segmentRef.data.idSeg
          this.compareSegment(
            sourceSegment,
            differential.srcIg.id,
            derivedIgId,
            segmentsMap[differential.srcIg.id][sourceSegment.data.idSeg],
            segmentsMap[derivedIgId][segmentRef.data.idSeg],
            configuration,
            datatypesMap,
            valuesetsMap
          );
        } else {
          // new segmentref
        }
      });
    } else {
      // Can't compare
    }
  },

  compareSegment(
    sourceSegment,
    srcIgId,
    derivedIgId,
    srcSegment,
    derivedSegment,
    configuration,
    datatypesMap,
    valuesetsMap
  ) {
    if (srcSegment && derivedSegment) {
      this.compareFields(
        sourceSegment,
        srcIgId,
        derivedIgId,
        derivedSegment.children,
        configuration,
        datatypesMap
      );
      if (configuration.valueset) {
        this.compareBindings(
          sourceSegment,
          srcIgId,
          derivedIgId,
          derivedSegment.bindings,
          configuration,
          datatypesMap,
          valuesetsMap
        );
      }

      if (sourceSegment.changed) {
        if (!sourceSegment.data.label.derived[derivedIgId]) {
          sourceSegment.data.label.derived[derivedIgId] = {
            value: derivedSegment.label
          };
        }
      }
      sourceSegment.children.sort(function(a, b) {
        return a.data.position - b.data.position;
      });
    }
  },
  compareBindings(
    segmentDifferential,
    srcIgId,
    derivedIgId,
    derivedBindings,
    configuration,
    datatypesMap,
    valuesetsMap
  ) {
    if (derivedBindings) {
      derivedBindings.forEach(derivedBinding => {
        let bindingDifferential = segmentDifferential.bindings.find(
          b => b.data.position === derivedBinding.position
        );
        if (bindingDifferential) {
          if (
            derivedBinding.strength !=
            bindingDifferential.data.strength.src.value
          ) {
            if (!bindingDifferential.data.strength.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              bindingDifferential.changed = true;
              bindingDifferential.data.strength.derived[derivedIgId] = {
                value: derivedBinding.strength
              };
            }
          }

          const diff = _.intersection(
            derivedBinding.valuesets,
            bindingDifferential.data.valuesets.src.value
          );
          if (
            derivedBinding.valuesets.length !==
              bindingDifferential.data.valuesets.src.value.length ||
            (diff && diff.length !== derivedBinding.valuesets.length)
          ) {
            if (!bindingDifferential.data.valuesets.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              bindingDifferential.changed = true;
              bindingDifferential.data.valuesets.derived[derivedIgId] = {
                value: derivedBinding.valuesets
              };
              if (derivedBinding.valuesets) {
                derivedBinding.valuesets.forEach(vs => {
                  if (!bindingDifferential.data.codes[vs]) {
                    bindingDifferential.data.codes[vs] = {
                      src: {},
                      derived: {}
                    };
                  }
                  if (
                    !bindingDifferential.data.codes[vs].derived[derivedIgId] &&
                    valuesetsMap[derivedIgId][vs]
                  ) {
                    bindingDifferential.data.codes[vs].derived[derivedIgId] =
                      valuesetsMap[derivedIgId][vs].children;
                  }
                });
              }

              if (
                derivedBinding.valuesets.length ===
                bindingDifferential.data.valuesets.src.value.length
              ) {
                // order both lists and compare codes
                let codes = bindingDifferential.data.codes;
                bindingDifferential.data.valuesets.src.value.forEach(
                  (vs, i) => {
                    const derivedVs = derivedBinding.valuesets[i];
                  }
                );
                // const srcValuesets = bindingDifferential.data.valuesets.src.value.sort(
                //   (a, b) => a - b
                // );
                // const derivedValuesets = derivedBinding.valuesets.sort(
                //   (a, b) => a - b
                // );
              }
            }
          } else {
            if (derivedBinding.valuesets) {
              derivedBinding.valuesets.forEach(vs => {
                if(valuesetsMap[srcIgId][vs] &&  valuesetsMap[derivedIgId][vs]){
                  if(vs === 'HL70211'){
                    console.log("===")
                    console.log(valuesetsMap[srcIgId][vs].children,  valuesetsMap[derivedIgId][vs].children)
                  }
                  if(ValuesetService.compareCodes(valuesetsMap[srcIgId][vs].children,  valuesetsMap[derivedIgId][vs].children)){
                    segmentDifferential.changed = true;
                    bindingDifferential.changed = true;
                    if (!bindingDifferential.data.codes[vs]) {
                      bindingDifferential.data.codes[vs] = {
                        src: {},
                        derived: {}
                      };
                      bindingDifferential.data.codes[vs].derived[derivedIgId] =
                      valuesetsMap[derivedIgId][vs].children;
                    }
                  }
                }
             

                

              });
            }
          
       
          }
        }
      });
    }
  },
  compareFields(
    segmentDifferential,
    srcIgId,
    derivedIgId,
    derivedFields,
    configuration,
    datatypesMap
  ) {
    derivedFields.forEach(derivedField => {
      let fieldDifferential = segmentDifferential.children.find(
        c => c.data.position === derivedField.position
      );
      if (fieldDifferential) {
        if (
          configuration.usage &&
          derivedField.usage != fieldDifferential.data.usage.src.value
        ) {
          if (!fieldDifferential.data.usage.derived[derivedIgId]) {
            segmentDifferential.changed = true;
            fieldDifferential.changed = true;
            fieldDifferential.data.usage.derived[derivedIgId] = {
              value: derivedField.usage
            };
          }
        }

        if (configuration.datatype) {
          if (
            derivedField.datatype != fieldDifferential.data.datatype.src.value
          ) {
            if (!fieldDifferential.data.datatype.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              fieldDifferential.changed = true;

              fieldDifferential.data.datatype.derived[derivedIgId] = {
                value: derivedField.datatype
              };
            }
          }

          const srcDt =
            datatypesMap[srcIgId][fieldDifferential.data.datatype.src.value];
          const derivedDt = datatypesMap[derivedIgId][derivedField.datatype];

          if (
            srcDt.children &&
            srcDt.children.length > 0 &&
            fieldDifferential.children &&
            fieldDifferential.children.length > 0
          ) {
            this.compareComponents(
              segmentDifferential,
              fieldDifferential,
              null,
              srcIgId,
              derivedIgId,
              derivedDt.children,
              configuration,
              datatypesMap
            );
          }
        }
        //OLD
        // if (
        //   configuration.datatype &&
        //   derivedField.datatype != fieldDifferential.data.datatype.src.value
        // ) {
        //   if (!fieldDifferential.data.datatype.derived[derivedIgId]) {
        //     segmentDifferential.changed = true;
        //     fieldDifferential.changed = true;

        //     fieldDifferential.data.datatype.derived[derivedIgId] = {
        //       value: derivedField.datatype
        //     };
        //     const srcDt =
        //       datatypesMap[srcIgId][fieldDifferential.data.datatype.src.value];
        //     const derivedDt = datatypesMap[derivedIgId][derivedField.datatype];
        //     if (srcDt.children && srcDt.children.length > 0) {
        //       this.compareComponents(
        //         segmentDifferential,
        //         fieldDifferential,
        //         srcIgId,
        //         derivedIgId,
        //         derivedDt.children,
        //         configuration,
        //         datatypesMap
        //       );
        //     }
        //   }
        // }
      }
    });
  },
  compareComponents(
    segmentDifferential,
    fieldDifferential,
    componentDifferential,
    srcIgId,
    derivedIgId,
    derivedComponents,
    configuration,
    datatypesMap
  ) {
    derivedComponents.forEach(derivedComponent => {
      let differential;

      if (componentDifferential) {
        differential = componentDifferential.children.find(
          c => c.data.position === derivedComponent.position
        );
      } else {
        differential = fieldDifferential.children.find(
          c => c.data.position === derivedComponent.position
        );
      }

      if (differential) {
        if (
          configuration.usage &&
          derivedComponent.usage != differential.data.usage.src.value
        ) {
          if (!differential.data.usage.derived[derivedIgId]) {
            segmentDifferential.changed = true;
            fieldDifferential.changed = true;

            if (componentDifferential) {
              componentDifferential.changed = true;
            }
            differential.changed = true;
            differential.data.usage.derived[derivedIgId] = {
              value: derivedComponent.usage
            };
          }
        }
        if (configuration.datatype) {
          if (
            derivedComponent.datatype != differential.data.datatype.src.value
          ) {
            if (!differential.data.datatype.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              fieldDifferential.changed = true;

              if (componentDifferential) {
                componentDifferential.changed = true;
              }
              differential.changed = true;

              differential.data.datatype.derived[derivedIgId] = {
                value: derivedComponent.datatype
              };
            }
          }

          const srcDt =
            datatypesMap[srcIgId][differential.data.datatype.src.value];

          const derivedDt =
            datatypesMap[derivedIgId][derivedComponent.datatype];
          if (
            srcDt.children &&
            srcDt.children.length > 0 &&
            differential.children
          ) {
            this.compareComponents(
              segmentDifferential,
              fieldDifferential,
              differential,
              srcIgId,
              derivedIgId,
              derivedDt.children,
              configuration,
              datatypesMap
            );
          }
        }

        //OLD
        // if (
        //   configuration.datatype &&
        //   derivedComponent.datatype !=
        //     componentDifferential.data.datatype.src.value
        // ) {
        //   if (!componentDifferential.data.datatype.derived[derivedIgId]) {
        //     fieldDifferential.changed = true;
        //     componentDifferential.changed = true;

        //     componentDifferential.data.datatype.derived[derivedIgId] = {
        //       value: derivedComponent.datatype
        //     };
        //     const srcDt =
        //       datatypesMap[srcIgId][
        //         componentDifferential.data.datatype.src.value
        //       ];
        //     const derivedDt =
        //       datatypesMap[derivedIgId][derivedComponent.datatype];
        //     if (srcDt.children && srcDt.children.length > 0) {
        //       this.compareComponents(
        //         componentDifferential,
        //         srcIgId,
        //         derivedIgId,
        //         derivedDt.children,
        //         configuration,
        //         datatypesMap
        //       );
        //     }
        //   }
        // }
      }
    });
  },

  createProfileDiff(
    originalId,
    originalProfile,
    derivedProfile,
    configuration
  ) {
    if (derivedProfile.SegmentRef) {
      this.createSegRefsDiff(
        originalId,
        originalProfile,
        derivedProfile.SegmentRef,
        configuration
      );
    }
    if (derivedProfile.Group) {
      this.createGroupsDiff(
        originalId,
        originalProfile,
        derivedProfile.Group,
        configuration
      );
    }
  },
  createGroupsDiff(originalId, originalProfile, groups, configuration) {
    if (groups) {
      if (originalProfile) {
        groups.forEach(group => {
          const length = group.SegmentRef.length;
          const usage = group.SegmentRef[0]["$"].usage;
          group["$"].usage = usage;
          group.SegmentRef.splice(length - 1, 1);
          group.SegmentRef.splice(0, 1);
          let originalGroup = originalProfile.children.find(
            p => p.data.position === group["$"].position
          );
          ComparisonService.compare(
            originalId,
            originalProfile,
            originalGroup,
            group["$"],
            configuration
          );
          this.createProfileDiff(
            originalId,
            originalGroup,
            group,
            configuration
          );
        });
      } else {
        // Can't compare
      }
    }
  },
  createSegRefsDiff(originalId, originalProfile, segRefs, configuration) {
    if (segRefs) {
      if (originalProfile) {
        segRefs.forEach(segRef => {
          let originalSegRef = originalProfile.children.find(
            p => p.data.position === segRef["$"].position
          );

          ComparisonService.compare(
            originalId,
            originalProfile,
            originalSegRef,
            segRef["$"],
            configuration
          );
          // if(changed){
          //     if (!originalSegRef.data.label.derived) {
          //         originalSegRef.data.label.derived = {};
          //       }
          //       originalSegRef.data.label.derived[originalId] = {
          //         value: segRef["$"].label
          //       };
          // }
        });
      } else {
        // Can't compare
      }
    }
  },

  createCard(min, max) {
    return `${min}..${max}`;
  }
};

module.exports = CalculationService;
