const ProfileService = require("./profileService");
const ComparisonService = require("./comparisonService");
const SegmentService = require("./segmentService");
const ValuesetService = require("./valuesetService");
const MetricService = require("./metricService");

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
      const profile = sourceProfile.profiles[0];
      const confProfile = profile.ConformanceProfile[0];
      results.srcIg.profileId = confProfile['$'].id
      // sourceProfile.profiles.forEach(profile => {
        results.profiles.push({
          data: {
            name: profile["$"].name,
            description: profile["$"].description,
            title: profile["$"].title,
            id: profile["$"].id
          },
          children: ProfileService.populateProfileChildren(
            profile.ConformanceProfile[0]
          ),
          segmentRefs: ProfileService.populateProfileSegments(
            profile.ConformanceProfile[0],
            "",
            segmentsMap,
            configuration,
            sourceProfile.id,
            datatypesMap,
            valuesetsMap
          ),
          bindings: this.extractProfileBindings(
            sourceProfile.id,
            profile.ConformanceProfile[0].Binding,
            configuration,
            valuesetsMap
          )
        });
      // });
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
        const profile = derivedIg.profiles[0];
        const confProfile = profile.ConformanceProfile[0];
        const originalProfileId = confProfile["$"].origin;

        results.derivedIgs.push({
          title: derivedIg.ig,
          id: derivedIg.id,
          profileOrigin: originalProfileId,
          derived: confProfile["$"].derived
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
      const originalProfile = results.profiles[0];
      originalProfile.segmentRefs = originalProfile.segmentRefs.filter(
        s => s.changed
      );
    }
    results.profiles.forEach(profile => {
      if (profile.reasons) {
        for (const path in profile.reasons) {
          const reason = profile.reasons[path];
          let child = this.getChildByPath(profile.children, path);
          if (child) {
            child.data.reason = reason;
          }
        }
      }

      profile.segmentRefs.forEach(segmentRef => {
        let child = this.getDataByPath(
          profile.children,
          segmentRef.data.path,
          segmentRef.changed
        );
        this.spreadBindings(segmentRef.children, segmentRef.bindings);
        child.children = segmentRef.children;
        child.bindings = segmentRef.bindings;
        child.fieldReasons = segmentRef.fieldReasons;
        child.changed = segmentRef.changed;
        child.data.changed = segmentRef.changed;
      });
      this.spreadProfileBindings(profile.children, profile.bindings);
    });

    return results;
  },
  extractProfileBindings(igId, Binding, configuration, valuesetsMap) {
    let bindings = [];
    if (
      Binding &&
      Binding[0].StructureElementBindings &&
      Binding[0].StructureElementBindings[0] &&
      Binding[0].StructureElementBindings[0].StructureElementBinding
    ) {
      bindings = ValuesetService.extractBindings(
        Binding[0].StructureElementBindings[0].StructureElementBinding,
        ""
      );
    }

    const diffBindings = ValuesetService.populateSrcValuesets(
      igId,
      bindings,
      configuration,
      valuesetsMap,
      "profile"
    );
    return diffBindings;
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
      if (binding.data.LocationInfoType === "COMPONENT") {
        const paths = binding.data.path.split(".");
        if (paths.length === 2) {
          let field = fields.find(f => f.data.position === paths[0]);
          if (field && field.children) {
            const component = field.children.find(
              c => c.data.position === paths[1]
            );
            if (component) {
              component.data.bindings = this.overrideBinding(
                component.data.bindings,
                binding,
                "segment"
              );
            }
          }
        } else {
          console.error("ERROR");
        }
      }
      if (binding.data.LocationInfoType === "SUBCOMPONENT") {
        const paths = binding.data.path.split(".");
        if (paths.length === 3) {
          let field = fields.find(f => f.data.position === paths[0]);
          if (field && field.children) {
            const component = field.children.find(
              c => c.data.position === paths[1]
            );
            if (component && component.children) {
              const subcomponent = component.children.find(
                c => c.data.position === paths[2]
              );
              if (subcomponent) {
                subcomponent.data.bindings = this.overrideBinding(
                  subcomponent.data.bindings,
                  binding,
                  "segment"
                );
              }
            }
          }
        } else {
          console.error("ERROR");
        }
      }
    });
  },
  spreadProfileBindings(segments, bindings) {
    bindings.forEach(binding => {
      if (binding.data.LocationInfoType === "FIELD") {
        const paths = binding.data.path.split(".");
        if (paths.length === 2) {
          let segment = segments.find(s => s.data.position === paths[0]);
          if (segment && segment.children) {
            let field = segment.children.find(
              f => f.data.position === paths[1]
            );
            if (field) {
              field.data.bindings = this.overrideBinding(
                field.data.bindings,
                binding,
                "profile"
              );
            }
          }
        } else {
          console.error("ERROR");
        }
      }
      if (binding.data.LocationInfoType === "COMPONENT") {
        const paths = binding.data.path.split(".");
        if (paths.length === 3) {
          let segment = segments.find(s => s.data.position === paths[0]);
          if (segment && segment.children) {
            let field = segment.children.find(
              f => f.data.position === paths[1]
            );
            if (field && field.children) {
              const component = field.children.find(
                c => c.data.position === paths[2]
              );
              if (component) {
                component.data.bindings = this.overrideBinding(
                  component.data.bindings,
                  binding,
                  "profile"
                );
              }
            }
          }
        } else {
          console.error("ERROR");
        }
      }
      if (binding.data.LocationInfoType === "SUBCOMPONENT") {
        const paths = binding.data.path.split(".");
        if (paths.length === 4) {
          let segment = segments.find(s => s.data.position === paths[0]);
          if (segment && segment.children) {
            let field = segment.children.find(
              f => f.data.position === paths[1]
            );
            if (field && field.children) {
              const component = field.children.find(
                c => c.data.position === paths[2]
              );
              if (component && component.children) {
                const subcomponent = component.children.find(
                  c => c.data.position === paths[3]
                );
                if (subcomponent) {
                  subcomponent.data.bindings = this.overrideBinding(
                    subcomponent.data.bindings,
                    binding,
                    "profile"
                  );
                }
              }
            }
          }
        } else {
          console.error("ERROR");
        }
      }
    });
  },
  overrideBinding(bindings, newBinding, context) {
    if (bindings) {
      bindings.forEach(binding => {
        // binding.data.context = context;
        for (const igId in newBinding.data.valuesets.derived) {
          binding.data.locations.derived[igId] =
            newBinding.data.locations.derived[igId];
          binding.data.strength.derived[igId] =
            newBinding.data.strength.derived[igId];
          // binding.data.valuesets.derived[igId] =
          //   newBinding.data.valuesets.derived[igId];
          binding.data.valuesets.derived[igId] = this.compareBindingValuesets(
            binding.data.valuesets.src.value,
            newBinding.data.valuesets.derived[igId].value
          );

          binding.data.context.derived[igId] = { value: context };
          if (newBinding.data.codes.derived) {
            binding.data.codes.derived[igId] =
              newBinding.data.codes.derived[igId];
          }
          binding.changed = true;
          binding.data.changed = true;
        }
      });

      return bindings;
    } else {
      return [newBinding];
    }
  },
  compareBindingValuesets(oldValuesets, newValuesets) {
    if (newValuesets) {
      newValuesets.forEach(newValueset => {
        if (oldValuesets) {
          const vs = oldValuesets.find(
            v =>
              v.bindingIdentifier === newValueset.bindingIdentifier &&
              v.version === newValueset.version
          );
          if (!vs) {
            newValueset.status = "added";
          }
        }
      });
    }
    return { value: newValuesets };
  },
  spreadDatatypeBindings(components, bindings, context) {
    bindings.forEach(binding => {
      if (binding.data.LocationInfoType === "COMPONENT") {
        let component = components.find(
          f => f.data.position === binding.data.position
        );
        if (component) {
          if (context === "datatype_component") {
            if (!component.data.bindings) {
              component.data.bindings = [];
            }
            if (component.data.bindings.length === 0) {
              component.data.bindings.push(binding);
            } else {
              if (!component.data.bindings[0].data.locations.src.value) {
                component.data.bindings[0].data.locations.src.value =
                  binding.data.locations.src.value;
              }
              if (!component.data.bindings[0].data.strength.src.value) {
                component.data.bindings[0].data.strength.src.value =
                  binding.data.strength.src.value;
              }
              if (!component.data.bindings[0].data.valuesets.src.value) {
                component.data.bindings[0].data.valuesets.src.value =
                  binding.data.valuesets.src.value;
              }
              if (
                binding.data.codes.src &&
                binding.data.codes.src.value &&
                (!component.data.bindings[0].data.codes ||
                  !component.data.bindings[0].data.codes.src.value)
              ) {
                component.data.bindings[0].data.codes.src.value =
                  binding.data.codes.src.value;
              }
            }
          }
          if (context === "datatype_field") {
            component.data.bindings = this.overrideBinding(
              component.data.bindings,
              binding,
              context
            );
          }
        }
      }
      if (binding.data.LocationInfoType === "SUBCOMPONENT") {
        const paths = binding.data.path.split(".");
        if (paths.length === 2) {
          let component = components.find(f => f.data.position === paths[0]);
          if (component && component.children) {
            const subcomponent = component.children.find(
              c => c.data.position === paths[1]
            );
            if (subcomponent) {
              subcomponent.data.bindings = this.overrideBinding(
                subcomponent.data.bindings,
                binding,
                context
              );
            }
          }
        } else {
          console.error("ERROR");
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
        newData.data.changed = changed;

        return this.getDataByPath(newData.children, paths.join("."), changed);
      }
    }
  },
  getChildByPath(data, path) {
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
        return this.getChildByPath(newData.children, paths.join("."));
      }
    }
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
      const profile = derivedIg.profiles[0];
      // derivedIg.profiles.forEach((profile, i) => {
      const confProfile = profile.ConformanceProfile[0];
      if (confProfile) {
        // const originalProfileId = confProfile["$"].origin;

        // const originalProfile = diff.profiles.find(
        //   p => p.data.id === originalProfileId
        // );
        const originalProfile = diff.profiles[0];
        if (originalProfile) {
          this.createProfileDiff(
            derivedIg.id,
            originalProfile,
            confProfile,
            configuration
          );

          this.createProfileBindingsDiff(
            diff,
            derivedIg.id,
            originalProfile,
            confProfile,
            configuration,
            valuesetsMap
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
          // console.log(originalProfile.segmentRefs)
        } else {
          // Can't compare
        }
        // originalProfile.segmentRefs = originalProfile.segmentRefs.filter(
        //   s => s.changed
        // );
      }
      // });
    }
  },
  createProfileBindingsDiff(
    differential,
    derivedIgId,
    originalProfile,
    derivedProfile,
    configuration,
    valuesetsMap
  ) {
    if (derivedProfile.Binding) {
      let bindings = [];
      if (
        derivedProfile.Binding &&
        derivedProfile.Binding[0].StructureElementBindings &&
        derivedProfile.Binding[0].StructureElementBindings[0] &&
        derivedProfile.Binding[0].StructureElementBindings[0]
          .StructureElementBinding
      ) {
        bindings = ValuesetService.extractBindings(
          derivedProfile.Binding[0].StructureElementBindings[0]
            .StructureElementBinding,
          ""
        );
      }
      this.compareBindings(
        originalProfile,
        differential.srcIg.id,
        derivedIgId,
        bindings,
        valuesetsMap,
        "profile",
        originalProfile
      );
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
          ...ProfileService.extractSegmentFromSegRefs(
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
          ...ProfileService.extractSegmentFromGroups(
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
            originalProfile,
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
      if (configuration.valueset) {
        // this.compareBindings(
        //   sourceSegment,
        //   srcIgId,
        //   derivedIgId,
        //   derivedSegment.bindings,
        //   configuration,
        //   datatypesMap,
        //   valuesetsMap
        // );
      }
    } else {
      // Can't compare
    }
  },

  compareSegment(
    originalProfile,
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
        originalProfile,
        sourceSegment,
        srcIgId,
        derivedIgId,
        derivedSegment.children,
        derivedSegment.fieldReasons,
        configuration,
        datatypesMap,
        valuesetsMap
      );
      if (configuration.valueset) {
        this.compareBindings(
          sourceSegment,
          srcIgId,
          derivedIgId,
          derivedSegment.bindings,
          valuesetsMap,
          "segment",
          originalProfile
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
    valuesetsMap,
    context,
    originalProfile
  ) {
    if (derivedBindings) {
      derivedBindings.forEach(derivedBinding => {
        let bindingDifferential = segmentDifferential.bindings.find(
          b => b.data && b.data.path === derivedBinding.path
        );

        if (bindingDifferential) {
          bindingDifferential.data.context.derived[derivedIgId] = {
            value: context
          };
          if (
            derivedBinding.strength !=
            bindingDifferential.data.strength.src.value
          ) {
            if (!bindingDifferential.data.strength.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              bindingDifferential.changed = true;
              bindingDifferential.data.changed = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                "strength"
              );
              bindingDifferential.data.strength.derived[derivedIgId] = {
                value: derivedBinding.strength,
                compliance
              };
            }
          }

          const derivedLocations = ValuesetService.extractLocations(
            derivedBinding.locations
          );
          const locationsDiff = _.difference(
            derivedLocations,
            bindingDifferential.data.locations.src.value
          );
          if (locationsDiff && locationsDiff.length > 0) {
            if (!bindingDifferential.data.locations.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              bindingDifferential.changed = true;
              bindingDifferential.data.changed = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                "location"
              );
              bindingDifferential.data.locations.derived[derivedIgId] = {
                value: derivedLocations,
                compliance
              };
            }
          }

          derivedBinding.valuesets.forEach((vs, i) => {
            const srcVs = bindingDifferential.data.valuesets.src.value.find(
              v => {
                return (
                  v.version === derivedBinding.versions[i] &&
                  v.bindingIdentifier === vs
                );
              }
            );

            if (srcVs) {
              // compare codes
              const comparedCodes = ValuesetService.compareCodes(
                valuesetsMap[srcIgId][vs][derivedBinding.versions[i]].children,
                valuesetsMap[derivedIgId][vs][derivedBinding.versions[i]]
                  .children
              );

              let diff = {
                bindingIdentifier: vs,
                version: derivedBinding.versions[i],
                status: "unchanged"
              };
              if (comparedCodes.changed) {
                segmentDifferential.changed = true;
                segmentDifferential.data.changed = true;
                bindingDifferential.changed = true;
                bindingDifferential.data.changed = true;
                diff.status = "changed";
                diff.codes = comparedCodes.list;
                const compliance = MetricService.updateBindingMetrics(
                  derivedIgId,
                  originalProfile,
                  "codes"
                );
                if (!bindingDifferential.data.valuesets.derived[derivedIgId]) {
                  bindingDifferential.data.valuesets.derived[derivedIgId] = {
                    value: [],
                    compliance
                  };
                }
                bindingDifferential.data.valuesets.derived[
                  derivedIgId
                ].value.push(diff);
              } else {
                // bindingDifferential.changed = true;
                // segmentDifferential.changed = true;
                // diff.codes =
                //   valuesetsMap[derivedIgId][vs][
                //     derivedBinding.versions[i]
                //   ].children;
                if (!bindingDifferential.data.valuesets.derived[derivedIgId]) {
                  bindingDifferential.data.valuesets.derived[derivedIgId] = {
                    value: []
                  };
                }
                if (bindingDifferential.data.valuesets.derived[derivedIgId])
                  bindingDifferential.data.valuesets.derived[
                    derivedIgId
                  ].value.push(diff);
              }
            } else {
              // Value set binding added
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              bindingDifferential.changed = true;
              bindingDifferential.data.changed = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                "vs"
              );

              if (!bindingDifferential.data.valuesets.derived[derivedIgId]) {
                bindingDifferential.data.valuesets.derived[derivedIgId] = {
                  value: [],
                  compliance
                };
              }
              bindingDifferential.data.valuesets.derived[
                derivedIgId
              ].value.push({
                bindingIdentifier: vs,
                version: derivedBinding.versions[i],
                // codes:
                //   valuesetsMap[derivedIgId][vs][derivedBinding.versions[i]]
                //     .children,
                status: "added"
              });
            }
          });
        } else {
          //TODO: binding added
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          let newBindingDifferential = {
            data: {
              status: "added",
              position: derivedBinding.position,
              path: derivedBinding.path,
              context: {
                src: {},
                derived: {}
              },
              bindingLocation: derivedBinding.bindingLocation,
              locations: {
                src: {},
                derived: {}
              },
              LocationInfoType: derivedBinding.LocationInfoType,
              strength: {
                src: {
                  // value: derivedBinding.strength
                },
                derived: {}
              },
              valuesets: {
                src: {},
                derived: {}
              },
              codes: ValuesetService.buildSrcCodes(
                derivedBinding.valuesets,
                derivedBinding.versions,
                valuesetsMap,
                derivedIgId
              )
            },
            changed: true
          };
          newBindingDifferential.data.context.derived[derivedIgId] = {
            value: context
          };
          newBindingDifferential.data.strength.derived[derivedIgId] = {
            value: derivedBinding.strength
          };
          newBindingDifferential.data.locations.derived[derivedIgId] = {
            value: ValuesetService.extractLocations(derivedBinding.locations)
          };
          newBindingDifferential.data.valuesets.derived[derivedIgId] = {
            value: ValuesetService.extractVSWithVersion(
              derivedBinding.valuesets,
              derivedBinding.versions,
              valuesetsMap,
              derivedIgId
            )
          };
          if (!segmentDifferential.bindings) {
            segmentDifferential.bindings = [];
          }
          segmentDifferential.bindings.push(newBindingDifferential);
        }
      });
    }
  },

  compareFields(
    originalProfile,
    segmentDifferential,
    srcIgId,
    derivedIgId,
    derivedFields,
    reasons,
    configuration,
    datatypesMap,
    valuesetsMap
  ) {
    derivedFields.forEach(derivedField => {
      let fieldDifferential = segmentDifferential.children.find(
        c => c.data.position === derivedField.position
      );

      if (fieldDifferential) {
        // if(segmentDifferential.data.ref === 'PID'){
        //   console.log(derivedField.position, derivedField.usage , fieldDifferential.data.usage.src.value, derivedField.usage != fieldDifferential.data.usage.src.value)
        // }

        if (reasons && reasons[fieldDifferential.data.position]) {
          if (!fieldDifferential.data.reason) {
            fieldDifferential.data.reason = {};
          }
          if (!fieldDifferential.data.reason[derivedIgId]) {
            fieldDifferential.data.reason[derivedIgId] = {};
          }
          fieldDifferential.data.reason[derivedIgId] =
            reasons[fieldDifferential.data.position];
        }
        if (
          configuration.usage &&
          derivedField.usage != fieldDifferential.data.usage.src.value
        ) {
          if (!fieldDifferential.data.usage.derived[derivedIgId]) {
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            const compliance = MetricService.updateUsageMetrics(
              derivedIgId,
              originalProfile,
              fieldDifferential.data.usage.src.value,
              derivedField.usage,
              `${segmentDifferential.data.ref}.${derivedField.position}`,
              fieldDifferential.data,
              `${segmentDifferential.data.path}.${derivedField.position}`
            );
            fieldDifferential.data.usage.derived[derivedIgId] = {
              value: derivedField.usage,
              reason: "",
              compliance
            };
          }
        }
        if (configuration.cardinality) {
          const card = ComparisonService.createCard(
            derivedField.min,
            derivedField.max
          );

          if (
            fieldDifferential.data.cardinality &&
            fieldDifferential.data.cardinality.src.value !== card
          ) {
            if (!fieldDifferential.data.cardinality.derived) {
              fieldDifferential.data.cardinality.derived = {};
            }
            const compliance = MetricService.updateCardinalityMetrics(
              derivedIgId,
              originalProfile,
              fieldDifferential.data.cardinality.src.value,
              card,
              `${segmentDifferential.data.ref}.${derivedField.position}`,
              fieldDifferential.data,
              `${segmentDifferential.data.path}.${derivedField.position}`
            );
            fieldDifferential.data.cardinality.derived[derivedIgId] = {
              value: card,
              reason: "",
              compliance
            };
          }
        }

        if (configuration.datatype) {
          if (
            derivedField.datatype != fieldDifferential.data.datatype.src.value
          ) {
            if (!fieldDifferential.data.datatype.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;
              const compliance = MetricService.updateDatatypeMetrics(
                derivedIgId,
                originalProfile,
                fieldDifferential.data.datatype.src.value,
                derivedField.datatype,
                `${segmentDifferential.data.ref}.${derivedField.position}`,
                fieldDifferential.data,
                `${segmentDifferential.data.path}.${derivedField.position}`
              );
              fieldDifferential.data.datatype.derived[derivedIgId] = {
                value: derivedField.datatype,
                reason: "",
                compliance
              };
            }
          }

          const srcDt =
            datatypesMap[srcIgId][fieldDifferential.data.datatype.src.value];
          const derivedDt = datatypesMap[derivedIgId][derivedField.datatype];

          if (configuration.valueset) {
            this.compareBindings(
              fieldDifferential,
              srcIgId,
              derivedIgId,
              derivedDt.bindings,
              valuesetsMap,
              "datatype_field",
              originalProfile
            );
            this.spreadDatatypeBindings(
              fieldDifferential.children,
              fieldDifferential.bindings,
              "datatype_field"
            );
          }

          if (
            srcDt.children &&
            srcDt.children.length > 0 &&
            fieldDifferential.children &&
            fieldDifferential.children.length > 0
          ) {
            this.compareComponents(
              originalProfile,
              segmentDifferential,
              fieldDifferential,
              null,
              srcIgId,
              derivedIgId,
              derivedDt.children,
              derivedDt.componentReasons,
              configuration,
              datatypesMap,
              valuesetsMap
            );
          }
        }
      }
    });
  },
  compareComponents(
    originalProfile,
    segmentDifferential,
    fieldDifferential,
    componentDifferential,
    srcIgId,
    derivedIgId,
    derivedComponents,
    reasons,
    configuration,
    datatypesMap,
    valuesetsMap
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
        if (reasons && reasons[differential.data.position]) {
          if (!differential.data.reason) {
            differential.data.reason = {};
          }
          if (!differential.data.reason[derivedIgId]) {
            differential.data.reason[derivedIgId] = {};
          }
          differential.data.reason[derivedIgId] =
            reasons[differential.data.position];
        }
        if (
          configuration.usage &&
          derivedComponent.usage != differential.data.usage.src.value
        ) {
          if (!differential.data.usage.derived[derivedIgId]) {
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;

            if (componentDifferential) {
              componentDifferential.changed = true;
              componentDifferential.data.changed = true;
              derivedComponent.type = "subcomponent";
            } else {
              derivedComponent.type = "component";

            }
            differential.changed = true;
            differential.data.changed = true;

            let path = `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`;
            let globalPath = `${segmentDifferential.data.path}.${fieldDifferential.data.position}`;
            let element = fieldDifferential.data;
            if (componentDifferential) {
              element = componentDifferential.data;
              path += `.${componentDifferential.data.position}`;
              globalPath += `.${componentDifferential.data.position}`;
            }
            path += `.${derivedComponent.position}`;
            globalPath += `.${derivedComponent.position}`;
            
            const compliance = MetricService.updateUsageMetrics(
              derivedIgId,
              originalProfile,
              differential.data.usage.src.value,
              derivedComponent.usage,
              path,
              derivedComponent,
              globalPath
            );
            differential.data.usage.derived[derivedIgId] = {
              value: derivedComponent.usage,
              reason: "",
              compliance
            };
          }
        }
        if (configuration.datatype) {
          if (
            derivedComponent.datatype != differential.data.datatype.src.value
          ) {
            if (!differential.data.datatype.derived[derivedIgId]) {
              segmentDifferential.changed = true;
              segmentDifferential.data.changed = true;
              fieldDifferential.changed = true;
              fieldDifferential.data.changed = true;

              if (componentDifferential) {
                componentDifferential.changed = true;
                componentDifferential.data.changed = true;
              }
              differential.changed = true;
              differential.data.changed = true;

              let path = `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`;
              let globalPath = `${segmentDifferential.data.path}.${fieldDifferential.data.position}`;
              let element = fieldDifferential.data;
              if (componentDifferential) {
                element = componentDifferential.data;
                path += `.${componentDifferential.data.position}`;
                globalPath += `.${componentDifferential.data.position}`;
              }
              path += `.${derivedComponent.position}`;
              globalPath += `.${derivedComponent.position}`;
              const compliance = MetricService.updateDatatypeMetrics(
                derivedIgId,
                originalProfile,
                differential.data.datatype.src.value,
                derivedComponent.datatype,
                path,
                element,
                globalPath
              );
              differential.data.datatype.derived[derivedIgId] = {
                value: derivedComponent.datatype,
                reason: "",
                compliance
              };
            }
          }

          const srcDt =
            datatypesMap[srcIgId][differential.data.datatype.src.value];
          const derivedDt =
            datatypesMap[derivedIgId][derivedComponent.datatype];

          if (configuration.valueset) {
            this.compareBindings(
              differential,
              srcIgId,
              derivedIgId,
              derivedDt.bindings,
              valuesetsMap,
              "datatype_component",
              originalProfile
            );
            this.spreadDatatypeBindings(
              differential.children,
              differential.bindings,
              "datatype_component"
            );
          }
          if (
            srcDt.children &&
            srcDt.children.length > 0 &&
            differential.children
          ) {
            this.compareComponents(
              originalProfile,
              segmentDifferential,
              fieldDifferential,
              differential,
              srcIgId,
              derivedIgId,
              derivedDt.children,
              derivedDt.componentReasons,
              configuration,
              datatypesMap,
              valuesetsMap
            );
          }
        }
      }
    });
  },

  createProfileDiff(
    originalId,
    originalProfile,
    derivedProfile,
    configuration
  ) {
    let reasons = derivedProfile.Reasons;
    if (reasons && reasons[0]) {
      if (!originalProfile.reasons) {
        originalProfile.reasons = {};
      }
      const reasonsForChange = reasons[0].Reason;
      reasonsForChange.forEach(reason => {
        reason = reason["$"];
        let splits = reason.Location.split(".");
        splits.shift();
        splits = splits.join(".");

        if (!originalProfile.reasons[splits]) {
          originalProfile.reasons[splits] = {};
        }
        if (!originalProfile.reasons[splits][originalId]) {
          originalProfile.reasons[splits][originalId] = {};
        }
        originalProfile.reasons[splits][originalId][
          reason.Property.toLowerCase()
        ] = reason.Text;
      });
    }
    // originalProfile.reasons = reasonsMap;

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
          // `${segmentDifferential.data.ref}.${derivedField.position}`,
          // fieldDifferential.data,
          // `${segmentDifferential.data.path}.${derivedField.position}`
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
  }
};

module.exports = CalculationService;
