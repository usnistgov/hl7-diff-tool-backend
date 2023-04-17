const ProfileService = require('./profileService');
const ComparisonService = require('../comparisonService');
const SegmentService = require('./segmentService');
const ValuesetService = require('./valuesetService');
const MetricService = require('../metricService');

const DatatypeService = require('./datatypeService');
const globalConfigs = require('../../../config/global');
const _ = require('underscore');

const xml2js = require('xml2js');
const builder = new xml2js.Builder();

let CalculationService = {
  calculate: function (
    sourceProfile,
    derivedIgs,
    configuration,
    summariesConfiguration
  ) {
    const res = this.createDifferential(
      sourceProfile,
      derivedIgs,
      configuration,
      summariesConfiguration
    );
    return res;
  },
  createDifferential(
    sourceProfile,
    derivedIgs,
    configuration,
    summariesConfiguration
  ) {
    let configRes = [];
    for (const conf in configuration) {
      if (configuration[conf]) {
        configRes.push({
          name: conf,
          label: globalConfigs.configLabels[conf],
        });
      }
    }
    let results = {
      profiles: [],
      srcIg: {
        title: sourceProfile.ig,
        id: sourceProfile.id,
      },
      derivedIgs: [],
      derivedIgsMap: {},
      configuration: [
        ...configRes,
        {
          name: 'label',
          label: 'Segment Ref.',
        },
      ],
      segments: [],
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
      results.srcIg.profileId = confProfile['$'].id;
      // sourceProfile.profiles.forEach(profile => {
      results.profiles.push({
        data: {
          name: profile['$'].name,
          description: profile['$'].description,
          title: profile['$'].title,
          id: profile['$'].id,
        },
        children: ProfileService.populateProfileChildren(
          profile.ConformanceProfile[0],
          ''
        ),
        segmentRefs: ProfileService.populateProfileSegments(
          profile.ConformanceProfile[0],
          '',
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
        ),
        conformanceStatements: confProfile.Constraints
          ? this.extractConformanceStatements(
              confProfile.Constraints[0].ConformanceStatement
            )
          : [],
        //TODO: conconst
        coConstraints: this.extractCoConstraints(
          confProfile.coConstraintsBindingsElement
        ),
      });
      // });
    }

    if (derivedIgs) {
      derivedIgs.forEach((derivedIg) => {
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
        const originalProfileId = confProfile['$'].origin;
        results.derivedIgsMap[derivedIg.id] = derivedIg.ig;
        results.derivedIgs.push({
          title: derivedIg.ig,
          id: derivedIg.id,
          profileOrigin: originalProfileId,
          derived: confProfile['$'].derived,
        });
        this.createProfilesDiff(
          results,
          derivedIg,
          configuration,
          segmentsMap,
          datatypesMap,
          valuesetsMap,
          summariesConfiguration
        );
      });
      const originalProfile = results.profiles[0];
      originalProfile.segmentRefs =
        originalProfile.segmentRefs.filter((s) => s.changed);
    }
    results.profiles.forEach((profile) => {
      if (profile.reasons) {
        for (const path in profile.reasons) {
          const reason = profile.reasons[path];
          let child = this.getChildByPath(profile.children, path);
          if (child) {
            child.data.reason = reason;
          }
        }
      }
      profile.segmentRefs.forEach((segmentRef) => {
        let child = this.getDataByPath(
          profile.children,
          segmentRef.data.path,
          segmentRef.changed
        );
        this.spreadBindings(segmentRef.children, segmentRef.bindings);
        child.children = segmentRef.children;
        child.bindings = segmentRef.bindings;
        child.data.conformanceStatements =
          segmentRef.conformanceStatements.filter(
            (c) => c.data.changed
          );

        child.fieldReasons = segmentRef.fieldReasons;
        child.changed = segmentRef.changed;
        child.data.changed = segmentRef.changed;
        child.data.changeTypes = segmentRef.data.changeTypes;
      });
      this.spreadProfileBindings(profile.children, profile.bindings);
    });

    return results;
  },
  extractCoConstraints(coConstraints) {
    let results = [];
    if (
      coConstraints &&
      coConstraints[0] &&
      coConstraints[0].coConstraintBindingElement
    ) {
      coConstraints[0].coConstraintBindingElement.forEach(
        (coConstraint) => {
          const c = coConstraint.coConstraintBindingSegmentElement[0];
          let diff = {
            data: {
              context: coConstraint.coConstraintContext[0],
              segmentName: c.coConstraintSegmentName[0],
              tables: {
                src: { value: [] },
                derived: {},
              },
            },
          };
          c.coConstraintTableConditionalBindingElement.forEach(
            (table) => {
              const t = {
                Document:
                  table.coConstraintsTable[0].coconstraints[0],
              };

              let a = builder.buildObject(t);
              diff.data.tables.src.value.push({
                html: a,
              });
            }
          );

          results.push(diff);
        }
      );
    }
    return results;
  },

  extractConformanceStatements(conformanceStatements) {
    let results = [];
    if (conformanceStatements) {
      conformanceStatements.forEach((conformanceStatement) => {
        let diff = {
          data: {
            id: conformanceStatement['$'].identifier,
            description: {
              src: { value: conformanceStatement['$'].description },
              derived: {},
            },
          },
        };
        results.push(diff);
      });
    }
    return results;
  },
  getConformanceStatementsDiff(conformanceStatements) {
    let result = [];
    if (conformanceStatements) {
      conformanceStatements.forEach((conformanceStatement) => {
        let diff = {
          data: {
            id: conformanceStatement.id,
            description: {
              src: { value: conformanceStatement.description },
              derived: {},
            },
          },
        };
        result.push(diff);
      });
    }
    return result;
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
        Binding[0].StructureElementBindings[0]
          .StructureElementBinding,
        ''
      );
    }

    const diffBindings = ValuesetService.populateSrcValuesets(
      igId,
      bindings,
      configuration,
      valuesetsMap,
      'profile'
    );
    return diffBindings;
  },
  spreadBindings(fields, bindings) {
    bindings.forEach((binding) => {
      if (binding.data.LocationInfoType === 'FIELD') {
        let field = fields.find(
          (f) => f.data.position === binding.data.position
        );
        if (field) {
          if (!field.data.bindings) {
            field.data.bindings = [];
          }
          field.data.bindings.push(binding);
        }
      }
      if (binding.data.LocationInfoType === 'COMPONENT') {
        const paths = binding.data.path.split('.');
        if (paths.length === 2) {
          let field = fields.find(
            (f) => f.data.position === paths[0]
          );
          if (field && field.children) {
            const component = field.children.find(
              (c) => c.data.position === paths[1]
            );
            if (component) {
              component.data.bindings = this.overrideBinding(
                component.data.bindings,
                binding,
                'segment'
              );
            }
          }
        } else {
          console.error('ERROR');
        }
      }
      if (binding.data.LocationInfoType === 'SUBCOMPONENT') {
        const paths = binding.data.path.split('.');
        if (paths.length === 3) {
          let field = fields.find(
            (f) => f.data.position === paths[0]
          );
          if (field && field.children) {
            const component = field.children.find(
              (c) => c.data.position === paths[1]
            );
            if (component && component.children) {
              const subcomponent = component.children.find(
                (c) => c.data.position === paths[2]
              );
              if (subcomponent) {
                subcomponent.data.bindings = this.overrideBinding(
                  subcomponent.data.bindings,
                  binding,
                  'segment'
                );
              }
            }
          }
        } else {
          console.error('ERROR');
        }
      }
    });
  },
  spreadProfileBindings(segments, bindings) {
    bindings.forEach((binding) => {
      if (binding.data.LocationInfoType === 'FIELD') {
        const paths = binding.data.path.split('.');
        if (paths.length === 2) {
          let segment = segments.find(
            (s) => s.data.position === paths[0]
          );
          if (segment && segment.children) {
            let field = segment.children.find(
              (f) => f.data.position === paths[1]
            );
            if (field) {
              field.data.bindings = this.overrideBinding(
                field.data.bindings,
                binding,
                'profile'
              );
            }
          }
        } else {
          console.error('ERROR');
        }
      }
      if (binding.data.LocationInfoType === 'COMPONENT') {
        const paths = binding.data.path.split('.');
        if (paths.length === 3) {
          let segment = segments.find(
            (s) => s.data.position === paths[0]
          );
          if (segment && segment.children) {
            let field = segment.children.find(
              (f) => f.data.position === paths[1]
            );
            if (field && field.children) {
              const component = field.children.find(
                (c) => c.data.position === paths[2]
              );
              if (component) {
                component.data.bindings = this.overrideBinding(
                  component.data.bindings,
                  binding,
                  'profile'
                );
              }
            }
          }
        } else {
          console.error('ERROR');
        }
      }
      if (binding.data.LocationInfoType === 'SUBCOMPONENT') {
        const paths = binding.data.path.split('.');
        if (paths.length === 4) {
          let segment = segments.find(
            (s) => s.data.position === paths[0]
          );
          if (segment && segment.children) {
            let field = segment.children.find(
              (f) => f.data.position === paths[1]
            );
            if (field && field.children) {
              const component = field.children.find(
                (c) => c.data.position === paths[2]
              );
              if (component && component.children) {
                const subcomponent = component.children.find(
                  (c) => c.data.position === paths[3]
                );
                if (subcomponent) {
                  subcomponent.data.bindings = this.overrideBinding(
                    subcomponent.data.bindings,
                    binding,
                    'profile'
                  );
                }
              }
            }
          }
        } else {
          console.error('ERROR');
        }
      }
    });
  },
  overrideBinding(bindings, newBinding, context) {
    if (bindings) {
      bindings.forEach((binding) => {
        // binding.data.context = context;
        for (const igId in newBinding.data.valuesets.derived) {
          binding.data.locations.derived[igId] =
            newBinding.data.locations.derived[igId];
          binding.data.strength.derived[igId] =
            newBinding.data.strength.derived[igId];
          // binding.data.valuesets.derived[igId] =
          //   newBinding.data.valuesets.derived[igId];
          binding.data.valuesets.derived[igId] =
            this.compareBindingValuesets(
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
          if (binding.data.changeTypes) {
            binding.data.changeTypes.push('valueset');
          }
        }
      });

      return bindings;
    } else {
      return [newBinding];
    }
  },
  compareBindingValuesets(oldValuesets, newValuesets) {
    if (newValuesets) {
      newValuesets.forEach((newValueset) => {
        if (oldValuesets) {
          const vs = oldValuesets.find(
            (v) =>
              v.bindingIdentifier === newValueset.bindingIdentifier &&
              v.version === newValueset.version
          );
          if (!vs) {
            newValueset.status = 'added';
          }
        }
      });
    }
    return { value: newValuesets };
  },
  spreadDatatypeBindings(components, bindings, context) {
    bindings.forEach((binding) => {
      if (binding.data.LocationInfoType === 'COMPONENT') {
        if (components) {
          let component = components.find(
            (f) => f.data.position === binding.data.position
          );
          if (component) {
            if (context === 'datatype_component') {
              if (!component.data.bindings) {
                component.data.bindings = [];
              }
              if (component.data.bindings.length === 0) {
                component.data.bindings.push(binding);
              } else {
                if (
                  !component.data.bindings[0].data.locations.src.value
                ) {
                  component.data.bindings[0].data.locations.src.value =
                    binding.data.locations.src.value;
                }
                if (
                  !component.data.bindings[0].data.strength.src.value
                ) {
                  component.data.bindings[0].data.strength.src.value =
                    binding.data.strength.src.value;
                }
                if (
                  !component.data.bindings[0].data.valuesets.src.value
                ) {
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
            if (context === 'datatype_field') {
              component.data.bindings = this.overrideBinding(
                component.data.bindings,
                binding,
                context
              );
            }
          }
        }
      }
      if (binding.data.LocationInfoType === 'SUBCOMPONENT') {
        const paths = binding.data.path.split('.');
        if (paths.length === 2) {
          let component = components.find(
            (f) => f.data.position === paths[0]
          );
          if (component && component.children) {
            const subcomponent = component.children.find(
              (c) => c.data.position === paths[1]
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
          console.error('ERROR');
        }
      }
    });
  },
  getDataByPath(data, path, changed) {
    const paths = path.split('.');

    if (paths.length < 2) {
      const result = data.find(
        (d) => d.data.position.toString() === paths[0].toString()
      );
      return result;
    } else {
      const newData = data.find((d) => d.data.position === path[0]);
      paths.shift();
      if (newData && newData.children) {
        newData.changed = changed;
        newData.data.changed = changed;

        return this.getDataByPath(
          newData.children,
          paths.join('.'),
          changed
        );
      }
    }
  },
  getChildByPath(data, path) {
    const paths = path.split('.');

    if (paths.length < 2) {
      const result = data.find(
        (d) => d.data.position.toString() === paths[0].toString()
      );
      return result;
    } else {
      const newData = data.find((d) => d.data.position === path[0]);
      paths.shift();
      if (newData && newData.children) {
        return this.getChildByPath(newData.children, paths.join('.'));
      }
    }
  },

  createProfilesDiff(
    diff,
    derivedIg,
    configuration,
    segmentsMap,
    datatypesMap,
    valuesetsMap,
    summariesConfiguration
  ) {
    if (derivedIg.profiles) {
      const profile = derivedIg.profiles[0];
      const confProfile = profile.ConformanceProfile[0];
      if (confProfile) {
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
          this.createConfStatementsDiff(
            derivedIg.id,
            originalProfile,
            confProfile,
            configuration
          );
          this.createCoConstraintsDiff(
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
            valuesetsMap,
            summariesConfiguration
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
  createCoConstraintsDiff(
    derivedIgId,
    originalProfile,
    derivedProfile,
    configuration
  ) {
    if (
      configuration.coConstraint &&
      derivedProfile.coConstraintsBindingsElement &&
      derivedProfile.coConstraintsBindingsElement[0]
    ) {
      let coConstraints = [];
      const coConstraintsObj =
        derivedProfile.coConstraintsBindingsElement[0]
          .coConstraintBindingElement;
      if (coConstraintsObj) {
        coConstraintsObj.forEach((coConstraint) => {
          let c = {
            context: coConstraint.coConstraintContext[0],
            segmentName:
              coConstraint.coConstraintBindingSegmentElement[0]
                .coConstraintSegmentName[0],
            tables: [],
          };
          coConstraint.coConstraintBindingSegmentElement[0].coConstraintTableConditionalBindingElement.forEach(
            (table) => {
              const t = {
                Document:
                  table.coConstraintsTable[0].coconstraints[0],
              };
              let a = builder.buildObject(t);
              c.tables.push({
                html: a,
              });
            }
          );
          coConstraints.push(c);
        });
        this.compareCoConstraints(
          originalProfile,
          derivedIgId,
          coConstraints
        );
      }
    }
  },
  createConfStatementsDiff(
    derivedIgId,
    originalProfile,
    derivedProfile,
    configuration
  ) {
    if (
      derivedProfile.Constraints &&
      configuration.conformanceStatement
    ) {
      let conformanceStatements = [];
      if (
        derivedProfile.Constraints &&
        derivedProfile.Constraints[0]
      ) {
        derivedProfile.Constraints[0].ConformanceStatement.forEach(
          (conformanceStatement) => {
            conformanceStatements.push({
              id: conformanceStatement['$'].identifier,
              description: conformanceStatement['$'].description,
            });
          }
        );
      }
      this.compareConformanceStatements(
        originalProfile,
        derivedIgId,
        conformanceStatements
      );
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
          ''
        );
      }
      this.compareBindings(
        originalProfile,
        differential.srcIg.id,
        derivedIgId,
        bindings,
        valuesetsMap,
        'profile',
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
    valuesetsMap,
    summariesConfiguration
  ) {
    let segmentRefs = [];

    if (originalProfile) {
      if (derivedProfile.SegmentRef) {
        segmentRefs.push(
          ...ProfileService.extractSegmentFromSegRefs(
            derivedProfile.SegmentRef,
            '',
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
            '',
            segmentsMap,
            configuration,
            derivedIgId,
            datatypesMap,
            valuesetsMap
          )
        );
      }
      if (configuration.segmentRef) {
        segmentRefs.forEach((segmentRef) => {
          const sourceSegment = originalProfile.segmentRefs.find(
            (s) => {
              return s.data.path === segmentRef.data.path;
            }
          );

          if (sourceSegment) {
            // compare sourceSegment.data.idSeg && segmentRef.data.idSeg

            this.compareSegment(
              originalProfile,
              sourceSegment,
              differential.srcIg.id,
              derivedIgId,
              segmentsMap[differential.srcIg.id][
                sourceSegment.data.idSeg
              ],
              segmentsMap[derivedIgId][segmentRef.data.idSeg],
              configuration,
              datatypesMap,
              valuesetsMap,
              summariesConfiguration
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
    valuesetsMap,
    summariesConfiguration
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
        valuesetsMap,
        summariesConfiguration
      );
      if (configuration.valueset) {
        this.compareBindings(
          sourceSegment,
          srcIgId,
          derivedIgId,
          derivedSegment.bindings,
          valuesetsMap,
          'segment',
          originalProfile
        );
      }
      if (configuration.conformanceStatement) {
        this.compareConformanceStatements(
          sourceSegment,
          derivedIgId,
          derivedSegment.conformanceStatements
        );
      }

      if (sourceSegment.changed) {
        if (!sourceSegment.data.label.derived[derivedIgId]) {
          sourceSegment.data.label.derived[derivedIgId] = {
            value: derivedSegment.label,
          };
        }

        if (
          sourceSegment.data.label.derived[derivedIgId].value !==
          sourceSegment.data.label.src.value
        ) {
          if (!originalProfile.summaries.segments) {
            originalProfile.summaries.segments = {};
          }
          const keyName = `${sourceSegment.data.label.src.value}#${sourceSegment.data.label.derived[derivedIgId].value}`;
          if (!originalProfile.summaries.segments[keyName]) {
            originalProfile.summaries.segments[keyName] = {};
          }
          if (
            !originalProfile.summaries.segments[keyName][derivedIgId]
          ) {
            originalProfile.summaries.segments[keyName][derivedIgId] =
              {
                number: 0,
                // changes: [],
              };
          }
          originalProfile.summaries.segments[keyName][derivedIgId]
            .number++;

          if (!originalProfile.summaries.segments[keyName].changes) {
            originalProfile.summaries.segments[keyName].changes = {};
          }
          if (
            !originalProfile.summaries.segments[keyName].changes[
              `${sourceSegment.data.path}.${sourceSegment.data.ref}`
            ]
          ) {
            originalProfile.summaries.segments[keyName].changes[
              `${sourceSegment.data.path}.${sourceSegment.data.ref}`
            ] = {
              type: sourceSegment.data.type,
              path: `${sourceSegment.data.path}`,
              name: sourceSegment.data.name.src.value,
              igs: {},
            };
          }
          originalProfile.summaries.segments[keyName].changes[
            `${sourceSegment.data.path}.${sourceSegment.data.ref}`
          ].igs[derivedIgId] = true;
        }
      }
      sourceSegment.children.sort(function (a, b) {
        return a.data.position - b.data.position;
      });
    }
  },
  compareCoConstraints(
    differential,
    derivedIgId,
    derivedCoConstraints
  ) {
    if (derivedCoConstraints) {
      derivedCoConstraints.forEach((derivedCoConstraint) => {
        let coConstraintDifferential =
          differential.coConstraints.find(
            (c) =>
              c.data.context === derivedCoConstraint.context &&
              c.data.segmentName === derivedCoConstraint.segmentName
          );
        if (!coConstraintDifferential) {
          //coConstraint added
          let diff = {
            data: {
              context: derivedCoConstraint.context,
              segmentName: derivedCoConstraint.segmentName,
              tables: {
                derived: {},
              },
            },
          };
          diff.data.tables.derived[derivedIgId] = {
            value: {
              html: derivedCoConstraint.tables,
            },
            status: 'added',
          };
          differential.coConstraints.push(diff);
        } else {
          // coConstraint found in diff. it may either be added from a previous calculated profile or it was in the original one. Need to compare based on another variable
          if (coConstraintDifferential.data.tables.src.value) {
            // table was in the src profile. Need to compare the 2 tables
            derivedCoConstraint.tables.forEach((table, i) => {
              let originalTable =
                coConstraintDifferential.data.tables.src.value[i];
              if (originalTable) {
                //compare the two tables
                if (originalTable.html !== table.html) {
                  //table changed
                  if (
                    !coConstraintDifferential.data.tables.derived[
                      derivedIgId
                    ]
                  ) {
                    coConstraintDifferential.data.tables.derived[
                      derivedIgId
                    ] = {
                      value: {
                        html: derivedCoConstraint.tables,
                      },
                      status: 'changed',
                    };
                  }
                } else {
                }
              } else {
                //table added?
              }
            });
          } else {
            // Tables was added
          }
        }

        // console.log(coConstraintDifferential);
      });
      differential.coConstraints.forEach((constraint) => {
        let c = differential.coConstraints;
      });
    }
  },
  compareConformanceStatements(
    differential,
    derivedIgId,
    derivedConfStatements
  ) {
    if (derivedConfStatements) {
      derivedConfStatements.forEach((derivedConfStatement) => {
        let confStatementDifferential =
          differential.conformanceStatements.find(
            (c) => c.data.id === derivedConfStatement.id
          );
        if (confStatementDifferential) {
          if (
            confStatementDifferential.data.description.src.value !==
            derivedConfStatement.description
          ) {
            // statement changed
            confStatementDifferential.data.description.derived[
              derivedIgId
            ] = {
              value: derivedConfStatement.description,
              status: 'changed',
            };
            differential.changed = true;
            if (differential.changeTypes) {
              differential.changeTypes.push('conformanceStatement');
            }

            confStatementDifferential.data.changed = true;
          }
        } else {
          // statement added
          let diff = {
            data: {
              id: derivedConfStatement.id,
              description: {
                src: {},
                derived: {},
              },
              changed: true,
            },
          };
          diff.data.description.derived[derivedIgId] = {
            value: derivedConfStatement.description,
            status: 'added',
          };
          differential.changed = true;
          if (differential.changeTypes) {
            differential.changeTypes.push('conformanceStatement');
          }
          differential.conformanceStatements.push(diff);
        }
      });
      differential.conformanceStatements.forEach(
        (conformanceStatement) => {
          let confStatementDifferential = derivedConfStatements.find(
            (c) => c.id === conformanceStatement.data.id
          );
          if (!confStatementDifferential) {
            //statement deleted

            conformanceStatement.data.description.derived[
              derivedIgId
            ] = {
              value: conformanceStatement.data.description.src.value,
              status: 'deleted',
            };
            differential.changed = true;
            if (differential.changeTypes) {
              differential.changeTypes.push('conformanceStatement');
            }
            conformanceStatement.data.changed = true;
          }
        }
      );
    }
  },
  compareBindings(
    differential,
    srcIgId,
    derivedIgId,
    derivedBindings,
    valuesetsMap,
    context,
    originalProfile
  ) {
    let changed = false;

    if (derivedBindings) {
      derivedBindings.forEach((derivedBinding) => {
        let bindingDifferential = differential.bindings.find(
          (b) => b.data && b.data.path === derivedBinding.path
        );

        if (bindingDifferential) {
          bindingDifferential.data.context.derived[derivedIgId] = {
            value: context,
          };
          if (
            derivedBinding.strength !=
            bindingDifferential.data.strength.src.value
          ) {
            if (
              !bindingDifferential.data.strength.derived[derivedIgId]
            ) {
              differential.changed = true;
              differential.data.changed = true;
              differential.data.changeTypes.push('valueset');
              bindingDifferential.changed = true;
              bindingDifferential.data.changed = true;
              changed = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                'strength'
              );
              bindingDifferential.data.strength.derived[derivedIgId] =
                {
                  value: derivedBinding.strength,
                  compliance,
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
            if (
              !bindingDifferential.data.locations.derived[derivedIgId]
            ) {
              differential.changed = true;
              differential.data.changed = true;
              differential.data.changeTypes.push('valueset');
              bindingDifferential.changed = true;
              bindingDifferential.data.changed = true;
              changed = true;
              const compliance = MetricService.updateBindingMetrics(
                derivedIgId,
                originalProfile,
                'location'
              );
              bindingDifferential.data.locations.derived[
                derivedIgId
              ] = {
                value: derivedLocations,
                compliance,
              };
            }
          }

          derivedBinding.valuesets.forEach((vs, i) => {
            if (
              valuesetsMap[derivedIgId] &&
              valuesetsMap[derivedIgId][vs] &&
              bindingDifferential.data.valuesets.src.value
            ) {
              const srcVs =
                bindingDifferential.data.valuesets.src.value.find(
                  (v) => {
                    return (
                      v.version === derivedBinding.versions[i] &&
                      v.bindingIdentifier === vs
                    );
                  }
                );

              if (srcVs) {
                // compare codes

                const comparedCodes = ValuesetService.compareCodes(
                  valuesetsMap[srcIgId][srcVs.bindingIdentifier][
                    srcVs.version
                  ].children,
                  valuesetsMap[derivedIgId][vs][
                    derivedBinding.versions[i]
                  ].children
                );

                let diff = {
                  bindingIdentifier: vs,
                  version: derivedBinding.versions[i],
                  status: 'unchanged',
                };
                if (comparedCodes.changed) {
                  differential.changed = true;
                  differential.data.changed = true;
                  differential.data.changeTypes.push('valueset');
                  bindingDifferential.changed = true;
                  bindingDifferential.data.changed = true;
                  bindingDifferential.data.showCodes = true;
                  changed = true;
                  diff.status = 'changed';
                  diff.codes = comparedCodes.list;
                  const compliance =
                    MetricService.updateBindingMetrics(
                      derivedIgId,
                      originalProfile,
                      'codes'
                    );
                  if (
                    !bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ]
                  ) {
                    bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ] = {
                      value: [],
                      compliance,
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
                  if (
                    !bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ]
                  ) {
                    bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ] = {
                      value: [],
                    };
                  }
                  if (
                    bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ]
                  )
                    bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ].value.push(diff);
                }
              } else {
                // New Value set added to binding
                differential.changed = true;
                differential.data.changed = true;
                differential.data.changeTypes.push('valueset');
                bindingDifferential.changed = true;
                bindingDifferential.data.changed = true;
                bindingDifferential.data.showCodes = true;
                changed = true;
                const compliance = MetricService.updateBindingMetrics(
                  derivedIgId,
                  originalProfile,
                  'vs'
                );

                if (
                  !bindingDifferential.data.valuesets.derived[
                    derivedIgId
                  ]
                ) {
                  bindingDifferential.data.valuesets.derived[
                    derivedIgId
                  ] = {
                    value: [],
                    compliance,
                  };
                }
                bindingDifferential.data.valuesets.derived[
                  derivedIgId
                ].value.push({
                  bindingIdentifier: vs,
                  version: derivedBinding.versions[i],
                  codes:
                    valuesetsMap[derivedIgId][vs][
                      derivedBinding.versions[i]
                    ].children,
                  status: 'added',
                });
              }
            }
          });
          if (bindingDifferential.data.valuesets.src.value) {
            bindingDifferential.data.valuesets.src.value.forEach(
              (valueset) => {
                let vs = derivedBinding.valuesets.find((v, i) => {
                  return (
                    derivedBinding.versions[i] === valueset.version &&
                    v === valueset.bindingIdentifier
                  );
                });
                if (!vs) {
                  //vs removed from binding
                  differential.changed = true;
                  differential.data.changed = true;
                  differential.data.changeTypes.push('valueset');
                  bindingDifferential.changed = true;
                  bindingDifferential.data.changed = true;
                  bindingDifferential.data.showCodes = true;
                  changed = true;
                  if (
                    !bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ]
                  ) {
                    bindingDifferential.data.valuesets.derived[
                      derivedIgId
                    ] = {
                      value: [],
                    };
                  }

                  bindingDifferential.data.valuesets.derived[
                    derivedIgId
                  ].value.push({
                    bindingIdentifier: valueset.bindingIdentifier,
                    codes:
                      valuesetsMap[derivedIgId][
                        valueset.bindingIdentifier
                      ] &&
                      valuesetsMap[derivedIgId][
                        valueset.bindingIdentifier
                      ][valueset.version]
                        ? valuesetsMap[derivedIgId][
                            valueset.bindingIdentifier
                          ][valueset.version].children
                        : [],
                    status: 'deleted',
                  });
                }
              }
            );
          }
        } else {
          // Added binding
          // TODO: update compliance
          differential.changed = true;
          differential.data.changed = true;
          differential.data.changeTypes.push('valueset');
          changed = true;
          let newBindingDifferential = {
            data: {
              status: 'added',
              showCodes: true,
              changed: true,
              position: derivedBinding.position,
              path: derivedBinding.path,
              context: {
                src: {},
                derived: {},
              },
              bindingLocation: derivedBinding.bindingLocation,
              locations: {
                src: {},
                derived: {},
              },
              LocationInfoType: derivedBinding.LocationInfoType,
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
              codes: ValuesetService.buildSrcCodes(
                derivedBinding.valuesets,
                derivedBinding.versions,
                valuesetsMap,
                derivedIgId
              ),
            },
            changed: true,
          };
          newBindingDifferential.data.context.derived[derivedIgId] = {
            value: context,
          };
          newBindingDifferential.data.strength.derived[derivedIgId] =
            {
              value: derivedBinding.strength,
            };
          newBindingDifferential.data.locations.derived[derivedIgId] =
            {
              value: ValuesetService.extractLocations(
                derivedBinding.locations
              ),
            };
          newBindingDifferential.data.valuesets.derived[derivedIgId] =
            {
              value: ValuesetService.extractVSWithVersion(
                derivedBinding.valuesets,
                derivedBinding.versions,
                valuesetsMap,
                derivedIgId
              ),
            };
          if (!differential.bindings) {
            differential.bindings = [];
          }
          differential.bindings.push(newBindingDifferential);
        }
      });
      differential.bindings.forEach((binding) => {
        let derivedBinding = derivedBindings.find(
          (b) => binding.data && binding.data.path === b.path
        );
        if (!derivedBinding && binding.data.status !== 'added') {
          //binding removed
          differential.changed = true;
          differential.data.changed = true;
          differential.data.changeTypes.push('valueset');
          binding.changed = true;
          binding.data.changed = true;
          changed = true;
          if (!binding.data.derived) {
            binding.data.derived = {};
          }
          binding.data.derived[derivedIgId] = {
            status: 'deleted',
          };
          binding.data.locations.derived[derivedIgId] = {
            value: binding.data.locations.src.value,
            status: 'deleted',
          };
          binding.data.strength.derived[derivedIgId] = {
            value: binding.data.strength.src.value,
            status: 'deleted',
          };
          binding.data.valuesets.derived[derivedIgId] = {
            value: binding.data.valuesets.src.value,
            status: 'deleted',
          };
        }
      });
    }
    return changed;
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
    valuesetsMap,
    summariesConfiguration
  ) {
    if (derivedFields.length >= segmentDifferential.children.length) {
      // New field may have been added. Need to check if the field from segmentDifferential was in the src profile or was added from a comparison of another derived profile (check for .added field)
      derivedFields.forEach((derivedField) => {
        let fieldDifferential = segmentDifferential.children.find(
          (c) => c.data.position === derivedField.position
        );
        if (fieldDifferential) {
          if (fieldDifferential.data.added) {
            // field wasn't in the src profile but was added in a previous comparison
            fieldDifferential.data.name.derived[derivedIgId] = {
              value: derivedField.name,
              status: 'added',
            };
            fieldDifferential.data.usage.derived[derivedIgId] = {
              value: derivedField.usage,
              status: 'added',
            };
            fieldDifferential.data.datatype.derived[derivedIgId] = {
              value: derivedField.datatype,
              status: 'added',
            };
            fieldDifferential.data.predicate.derived[derivedIgId] = {
              value: derivedField.predicate,
              status: 'added',
            };
            //TODO: Think about binding. It's in the list of parent.
          } else {
            // field was in src profile. Just need to compare

            this.compareFieldsData(
              fieldDifferential,
              originalProfile,
              segmentDifferential,
              srcIgId,
              derivedIgId,
              derivedField,
              reasons,
              configuration,
              datatypesMap,
              valuesetsMap,
              summariesConfiguration
            );
          }
        } else {
          // field was added
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('field');

          let diff = {
            data: {
              added: true,
              name: {
                src: null,
                derived: {},
              },
              position: derivedField.position,
              type: derivedField.type,
              path: `${segmentDifferential.data.ref}.${derivedField.position}`,
              usage: {
                src: null,
                derived: {},
              },
              datatype: { src: null, derived: {} },
              predicate: { src: null, derived: {} },
            },
          };
          diff.data.name.derived[derivedIgId] = {
            value: derivedField.name,
            status: 'added',
          };
          diff.data.usage.derived[derivedIgId] = {
            value: derivedField.usage,
            status: 'added',
          };
          diff.data.datatype.derived[derivedIgId] = {
            value: derivedField.datatype,
            status: 'added',
          };
          diff.data.predicate.derived[derivedIgId] = {
            value: derivedField.predicate,
            status: 'added',
          };
          //TODO: Think about binding. It's in the list of parent.
          segmentDifferential.children.push(diff);
          segmentDifferential.children.sort(function (a, b) {
            return a.data.position - b.data.position;
          });
        }
      });
    } else {
      // fields may have been removed. Check for.added field to determine if it was removed from src
      segmentDifferential.children.forEach((differential) => {
        let derivedField = derivedFields.find(
          (d) => d.position === differential.data.position
        );
        if (derivedField) {
          if (differential.data.added) {
            // component added
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            segmentDifferential.data.changeTypes.push('component');

            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            fieldDifferential.data.changeTypes.push('component');

            differential.data.name.derived[derivedIgId] = {
              value: derivedField.name,
              status: 'added',
            };
            differential.data.usage.derived[derivedIgId] = {
              value: derivedField.usage,
              status: 'added',
            };
            differential.data.datatype.derived[derivedIgId] = {
              value: derivedField.datatype,
              status: 'added',
            };
            differential.data.predicate.derived[derivedIgId] = {
              value: derivedField.predicate,
              status: 'added',
            };
            //TODO: Think about binding. It's in the list of parent.
          } else {
            // field was in src profile. Just need to compare
            this.compareFieldsData(
              differential,
              originalProfile,
              segmentDifferential,
              srcIgId,
              derivedIgId,
              derivedField,
              reasons,
              configuration,
              datatypesMap,
              valuesetsMap,
              summariesConfiguration
            );
          }
        } else {
          // if added. Means that field was added in another profile. So no need to check anything
          if (!differential.data.added) {
            // field removed
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            segmentDifferential.data.changeTypes.push('field');

            differential.changed = true;
            differential.data.changed = true;

            differential.data.name.derived[derivedIgId] = {
              value: differential.data.name.src.value,
              status: 'deleted',
            };
            differential.data.usage.derived[derivedIgId] = {
              value: differential.data.usage.src.value,
              status: 'deleted',
            };
            differential.data.datatype.derived[derivedIgId] = {
              value: differential.data.datatype.src.value,
              status: 'deleted',
            };
            differential.data.predicate.derived[derivedIgId] = {
              value: differential.data.predicate.src.value,
              status: 'deleted',
            };
            //TODO: Think about binding. It's in the list of parent.
          }
        }
      });
    }
  },
  compareFieldsData(
    fieldDifferential,
    originalProfile,
    segmentDifferential,
    srcIgId,
    derivedIgId,
    derivedField,
    reasons,
    configuration,
    datatypesMap,
    valuesetsMap,
    summariesConfiguration
  ) {
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
    // Compare name
    if (derivedField.name !== fieldDifferential.data.name.src.value) {
      segmentDifferential.changed = true;
      segmentDifferential.data.changed = true;
      segmentDifferential.data.changeTypes.push('name');

      fieldDifferential.changed = true;
      fieldDifferential.data.changed = true;
      fieldDifferential.data.changeTypes.push('name');

      fieldDifferential.data.name.derived[derivedIgId] = {
        value: derivedField.name,
      };
    }
    derivedField.type = 'field';

    //Compare usage
    if (configuration.usage) {
      if (
        derivedField.usage != fieldDifferential.data.usage.src.value
      ) {
        if (!fieldDifferential.data.usage.derived[derivedIgId]) {
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('usage');
          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('usage');
          const compliance = MetricService.updateUsageMetrics(
            derivedIgId,
            originalProfile,
            fieldDifferential.data.usage.src.value,
            derivedField.usage,
            `${segmentDifferential.data.ref}.${derivedField.position}`,
            derivedField,
            `${segmentDifferential.data.path}.${derivedField.position}`
          );
          fieldDifferential.data.usage.derived[derivedIgId] = {
            value: derivedField.usage,
            reason: '',
            compliance,
          };
        }
      }

      let selectedField = summariesConfiguration.fields.find((f) => {
        let result = f.name === fieldDifferential.data.name.src.value;
        if (f.construct) {
          result =
            result && f.construct === segmentDifferential.data.ref;
        }
        if (f.location) {
          result =
            result && f.location === fieldDifferential.data.path;
        }
        return result;
      });
      if (selectedField) {
        let dataElement = originalProfile.summaries.dataElements.find(
          (el) =>
            el.name === fieldDifferential.data.name.src.value &&
            el.path ===
              `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`
        );
        if (dataElement) {
          if (!dataElement.changes.usage) {
            dataElement.changes.usage = {
              src: {
                value: fieldDifferential.data.usage.src.value,
              },
              derived: {},
            };
          }

          dataElement.changes.usage.derived[derivedIgId] = {
            value: derivedField.usage,
          };
          if (
            derivedField.usage !=
            fieldDifferential.data.usage.src.value
          ) {
            dataElement.changes.usage.derived[
              derivedIgId
            ].changed = true;
          }
        } else {
          let dtElement = {
            name: fieldDifferential.data.name.src.value,
            location: fieldDifferential.data.path,
            path: `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`,
            type: 'field',
            changes: {
              usage: {
                src: {
                  value: fieldDifferential.data.usage.src.value,
                },
                derived: {},
              },
            },
          };
          dtElement.changes.usage.derived[derivedIgId] = {
            value: derivedField.usage,
          };
          if (
            derivedField.usage !=
            fieldDifferential.data.usage.src.value
          ) {
            dtElement.changes.usage.derived[
              derivedIgId
            ].changed = true;
          }
          originalProfile.summaries.dataElements.push(dtElement);
        }
      }
    }

    if (
      configuration.predicate &&
      derivedField.predicate !=
        fieldDifferential.data.predicate.src.value
    ) {
      if (!fieldDifferential.data.predicate.derived[derivedIgId]) {
        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        segmentDifferential.data.changeTypes.push('predicate');

        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        fieldDifferential.data.changeTypes.push('predicate');

        fieldDifferential.data.predicate.derived[derivedIgId] = {
          value: derivedField.predicate,
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
          derivedField,
          `${segmentDifferential.data.path}.${derivedField.position}`
        );
        fieldDifferential.data.cardinality.derived[derivedIgId] = {
          value: card,
          reason: '',
          compliance,
        };
      }
    }

    if (configuration.datatype) {
      if (
        derivedField.datatype !=
        fieldDifferential.data.datatype.src.value
      ) {
        if (!fieldDifferential.data.datatype.derived[derivedIgId]) {
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('datatype');
          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('datatype');

          const compliance = MetricService.updateDatatypeMetrics(
            derivedIgId,
            originalProfile,
            fieldDifferential.data.datatype.src.value,
            derivedField.datatype,
            `${segmentDifferential.data.ref}.${derivedField.position}`,
            derivedField,
            `${segmentDifferential.data.path}.${derivedField.position}`
          );
          fieldDifferential.data.datatype.derived[derivedIgId] = {
            value: derivedField.datatype,
            reason: '',
            compliance,
          };

          if (!originalProfile.summaries.datatypes) {
            originalProfile.summaries.datatypes = {};
          }

          const keyName = `${fieldDifferential.data.datatype.src.value}#${derivedField.datatype}`;
          if (!originalProfile.summaries.datatypes[keyName]) {
            originalProfile.summaries.datatypes[keyName] = {};
          }

          if (
            !originalProfile.summaries.datatypes[keyName][derivedIgId]
          ) {
            originalProfile.summaries.datatypes[keyName][
              derivedIgId
            ] = {
              number: 0,
              // changes: [],
            };
          }

          originalProfile.summaries.datatypes[keyName][derivedIgId]
            .number++;
          // originalProfile.summaries.datatypes[keyName][
          //   derivedIgId
          // ].changes.push({
          //   type: fieldDifferential.data.type,
          //   path: `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`,
          //   name: fieldDifferential.data.name.src.value,
          // });
          if (!originalProfile.summaries.datatypes[keyName].changes) {
            originalProfile.summaries.datatypes[keyName].changes = {};
          }
          if (
            !originalProfile.summaries.datatypes[keyName].changes[
              `${segmentDifferential.data.ref}.${fieldDifferential.data.position}.${fieldDifferential.data.name.src.value}`
            ]
          ) {
            originalProfile.summaries.datatypes[keyName].changes[
              `${segmentDifferential.data.ref}.${fieldDifferential.data.position}.${fieldDifferential.data.name.src.value}`
            ] = {
              type: fieldDifferential.data.type,
              path: `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`,
              name: fieldDifferential.data.name.src.value,
              igs: {},
            };
          }
          originalProfile.summaries.datatypes[keyName].changes[
            `${segmentDifferential.data.ref}.${fieldDifferential.data.position}.${fieldDifferential.data.name.src.value}`
          ].igs[derivedIgId] = true;
        }
      }

      const srcDt =
        datatypesMap[srcIgId][
          fieldDifferential.data.datatype.src.value
        ];
      const derivedDt =
        datatypesMap[derivedIgId][derivedField.datatype];

      let selectedField = summariesConfiguration.fields.find((f) => {
        let result = f.name === fieldDifferential.data.name.src.value;
        if (f.construct) {
          result =
            result && f.construct === segmentDifferential.data.ref;
        }
        if (f.location) {
          result =
            result && f.location === fieldDifferential.data.path;
        }
        return result;
      });

      if (selectedField) {
        let dataElement = originalProfile.summaries.dataElements.find(
          (el) =>
            el.name === fieldDifferential.data.name.src.value &&
            el.path ===
              `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`
        );
        if (dataElement) {
          if (!dataElement.changes.datatype) {
            dataElement.changes.datatype = {
              src: {
                value: fieldDifferential.data.datatype.src.value,
              },
              derived: {},
            };
          }

          dataElement.changes.datatype.derived[derivedIgId] = {
            value: derivedField.datatype,
          };
          if (
            derivedField.datatype !=
            fieldDifferential.data.datatype.src.value
          ) {
            dataElement.changes.datatype.derived[
              derivedIgId
            ].changed = true;
          }
        } else {
          let dtElement = {
            name: fieldDifferential.data.name.src.value,
            location: fieldDifferential.data.path,
            path: `${segmentDifferential.data.ref}.${fieldDifferential.data.position}`,
            type: 'field',
            changes: {
              datatype: {
                src: {
                  value: fieldDifferential.data.datatype.src.value,
                },
                derived: {},
              },
            },
          };
          dtElement.changes.datatype.derived[derivedIgId] = {
            value: derivedField.datatype,
          };
          if (
            derivedField.datatype !=
            fieldDifferential.data.datatype.src.value
          ) {
            dtElement.changes.datatype.derived[
              derivedIgId
            ].changed = true;
          }
          originalProfile.summaries.dataElements.push(dtElement);
        }
      }

      if (configuration.conformanceStatement) {
        if (!fieldDifferential.data.conformanceStatements) {
          fieldDifferential.data.conformanceStatements =
            this.getConformanceStatementsDiff(
              srcDt.conformanceStatements
            );
        }

        this.compareConformanceStatements(
          fieldDifferential.data,
          derivedIgId,
          derivedDt.conformanceStatements
        );
      }
      if (configuration.valueset) {
        const changed = this.compareBindings(
          fieldDifferential,
          srcIgId,
          derivedIgId,
          derivedDt.bindings,
          valuesetsMap,
          'datatype_field',
          originalProfile
        );
        if (changed) {
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('valueset');
        }
        this.spreadDatatypeBindings(
          fieldDifferential.children,
          fieldDifferential.bindings,
          'datatype_field'
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
    let commonDifferential;
    if (componentDifferential) {
      commonDifferential = componentDifferential;
    } else {
      commonDifferential = fieldDifferential;
    }
    if (
      derivedComponents.length >= commonDifferential.children.length
    ) {
      // New component may have been added. Need to check if the component from commonDifferential was in the src profile or was added from a comparison of another derived profile (check for .added field)
      derivedComponents.forEach((derivedComponent) => {
        let differential = commonDifferential.children.find(
          (c) => c.data.position === derivedComponent.position
        );

        if (differential) {
          if (differential.data.added) {
            // component wasn't in the src profile but was added in a previous comparison
            differential.data.name.derived[derivedIgId] = {
              value: derivedComponent.name,
              status: 'added',
            };
            differential.data.usage.derived[derivedIgId] = {
              value: derivedComponent.usage,
              status: 'added',
            };
            differential.data.datatype.derived[derivedIgId] = {
              value: derivedComponent.datatype,
              status: 'added',
            };
            differential.data.predicate.derived[derivedIgId] = {
              value: derivedComponent.predicate,
              status: 'added',
            };
            //TODO: Think about binding. It's in the list of parent.
          } else {
            // component was in src profile. Just need to compare
            this.compareComponentData(
              differential,
              originalProfile,
              segmentDifferential,
              fieldDifferential,
              componentDifferential,
              srcIgId,
              derivedIgId,
              derivedComponent,
              reasons,
              configuration,
              datatypesMap,
              valuesetsMap
            );
          }
        } else {
          // component was added
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('component');

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('component');

          if (componentDifferential) {
            componentDifferential.changed = true;
            componentDifferential.data.changed = true;
            componentDifferential.data.changeTypes.push('component');

            derivedComponent.type = 'subcomponent';
          } else {
            derivedComponent.type = 'component';
          }
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

          let diff = {
            data: {
              added: true,
              name: {
                src: null,
                derived: {},
              },
              position: derivedComponent.position,
              type: derivedComponent.type,
              path: globalPath,
              usage: {
                src: null,
                derived: {},
              },
              datatype: { src: null, derived: {} },
              predicate: { src: null, derived: {} },
            },
          };
          diff.data.name.derived[derivedIgId] = {
            value: derivedComponent.name,
            status: 'added',
          };
          diff.data.usage.derived[derivedIgId] = {
            value: derivedComponent.usage,
            status: 'added',
          };
          diff.data.datatype.derived[derivedIgId] = {
            value: derivedComponent.datatype,
            status: 'added',
          };
          diff.data.predicate.derived[derivedIgId] = {
            value: derivedComponent.predicate,
            status: 'added',
          };
          //TODO: Think about binding. It's in the list of parent.
          commonDifferential.children.push(diff);
          commonDifferential.children.sort(function (a, b) {
            return a.data.position - b.data.position;
          });
        }
      });
    } else {
      // Components may have been removed. Check for.added field to determine if it was removed from src
      commonDifferential.children.forEach((differential) => {
        let derivedComponent = derivedComponents.find(
          (d) => d.position === differential.data.position
        );
        if (derivedComponent) {
          if (differential.data.added) {
            // component added
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            segmentDifferential.data.changeTypes.push('component');

            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            fieldDifferential.data.changeTypes.push('component');

            commonDifferential.changed = true;
            commonDifferential.data.changed = true;
            commonDifferential.data.changeTypes.push('component');

            differential.data.name.derived[derivedIgId] = {
              value: derivedComponent.name,
              status: 'added',
            };
            differential.data.usage.derived[derivedIgId] = {
              value: derivedComponent.usage,
              status: 'added',
            };
            differential.data.datatype.derived[derivedIgId] = {
              value: derivedComponent.datatype,
              status: 'added',
            };
            differential.data.predicate.derived[derivedIgId] = {
              value: derivedComponent.predicate,
              status: 'added',
            };
            //TODO: Think about binding. It's in the list of parent.
          } else {
            // component was in src profile. Just need to compare
            this.compareComponentData(
              differential,
              originalProfile,
              segmentDifferential,
              fieldDifferential,
              componentDifferential,
              srcIgId,
              derivedIgId,
              derivedComponent,
              reasons,
              configuration,
              datatypesMap,
              valuesetsMap
            );
          }
        } else {
          // if added. Means that components was added in another profile. So no need to check anything
          if (!differential.data.added) {
            // component removed
            segmentDifferential.changed = true;
            segmentDifferential.data.changed = true;
            segmentDifferential.data.changeTypes.push('component');

            fieldDifferential.changed = true;
            fieldDifferential.data.changed = true;
            fieldDifferential.data.changeTypes.push('component');

            commonDifferential.changed = true;
            commonDifferential.data.changed = true;
            commonDifferential.data.changeTypes.push('component');

            differential.data.name.derived[derivedIgId] = {
              value: differential.data.name.src.value,
              status: 'deleted',
            };
            differential.data.usage.derived[derivedIgId] = {
              value: differential.data.usage.src.value,
              status: 'deleted',
            };
            differential.data.datatype.derived[derivedIgId] = {
              value: differential.data.datatype.src.value,
              status: 'deleted',
            };
            differential.data.predicate.derived[derivedIgId] = {
              value: differential.data.predicate.src.value,
              status: 'deleted',
            };
            //TODO: Think about binding. It's in the list of parent.
          }
        }
      });
    }
  },
  compareComponentData(
    differential,
    originalProfile,
    segmentDifferential,
    fieldDifferential,
    componentDifferential,
    srcIgId,
    derivedIgId,
    derivedComponent,
    reasons,
    configuration,
    datatypesMap,
    valuesetsMap
  ) {
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

    // Compare name
    if (derivedComponent.name !== differential.data.name.src.value) {
      segmentDifferential.changed = true;
      segmentDifferential.data.changed = true;
      segmentDifferential.data.changeTypes.push('name');

      fieldDifferential.changed = true;
      fieldDifferential.data.changed = true;
      fieldDifferential.data.changeTypes.push('name');

      differential.changed = true;
      differential.data.changed = true;
      differential.data.changeTypes.push('name');

      if (componentDifferential) {
        componentDifferential.changed = true;
        componentDifferential.data.changed = true;
        componentDifferential.data.changeTypes.push('name');

        derivedComponent.type = 'subcomponent';
      } else {
        derivedComponent.type = 'component';
      }

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
      differential.data.name.derived[derivedIgId] = {
        value: derivedComponent.name,
      };
    }

    //Compare usage
    if (
      configuration.usage &&
      derivedComponent.usage != differential.data.usage.src.value
    ) {
      if (!differential.data.usage.derived[derivedIgId]) {
        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        segmentDifferential.data.changeTypes.push('usage');

        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        fieldDifferential.data.changeTypes.push('usage');

        if (componentDifferential) {
          componentDifferential.changed = true;
          componentDifferential.data.changed = true;
          componentDifferential.data.changeTypes.push('usage');

          derivedComponent.type = 'subcomponent';
        } else {
          derivedComponent.type = 'component';
        }
        differential.changed = true;
        differential.data.changed = true;
        differential.data.changeTypes.push('usage');

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
          reason: '',
          compliance,
        };
        if (componentDifferential) {
          if (!componentDifferential.data.consequential) {
            componentDifferential.data.consequential = {
              src: false,
              derived: {},
            };
          }

          if (
            (componentDifferential.data.usage.derived[derivedIgId] &&
              (componentDifferential.data.usage.derived[derivedIgId]
                .value === 'R' ||
                componentDifferential.data.usage.derived[derivedIgId]
                  .value === 'RE')) ||
            (!componentDifferential.data.usage.derived[derivedIgId] &&
              (componentDifferential.data.usage.src.value === 'R' ||
                componentDifferential.data.usage.src.value === 'RE'))
          ) {
            componentDifferential.data.consequential.derived[
              derivedIgId
            ] = true;
            componentDifferential.data.consequential.src = true;
          } else {
            componentDifferential.data.consequential.derived[
              derivedIgId
            ] = false;
          }
        } else {
          if (!fieldDifferential.data.consequential) {
            fieldDifferential.data.consequential = {
              src: false,
              derived: {},
            };
          }

          if (
            (fieldDifferential.data.usage.derived[derivedIgId] &&
              (fieldDifferential.data.usage.derived[derivedIgId]
                .value === 'R' ||
                fieldDifferential.data.usage.derived[derivedIgId]
                  .value === 'RE')) ||
            (!fieldDifferential.data.usage.derived[derivedIgId] &&
              (fieldDifferential.data.usage.src.value === 'R' ||
                fieldDifferential.data.usage.src.value === 'RE'))
          ) {
            fieldDifferential.data.consequential.derived[
              derivedIgId
            ] = true;
            fieldDifferential.data.consequential.src = true;
          } else {
            fieldDifferential.data.consequential.derived[
              derivedIgId
            ] = false;
          }
        }
      }
    }

    if (
      configuration.predicate &&
      derivedComponent.predicate !=
        differential.data.predicate.src.value
    ) {
      if (!differential.data.predicate.derived[derivedIgId]) {
        segmentDifferential.changed = true;
        segmentDifferential.data.changed = true;
        segmentDifferential.data.changeTypes.push('predicate');

        fieldDifferential.changed = true;
        fieldDifferential.data.changed = true;
        fieldDifferential.data.changeTypes.push('predicate');

        if (componentDifferential) {
          componentDifferential.changed = true;
          componentDifferential.data.changed = true;
          componentDifferential.data.changeTypes.push('predicate');

          derivedComponent.type = 'subcomponent';
        } else {
          derivedComponent.type = 'component';
        }
        differential.changed = true;
        differential.data.changed = true;
        differential.data.changeTypes.push('predicate');

        differential.data.predicate.derived[derivedIgId] = {
          value: derivedComponent.predicate,
        };
      }
    }
    if (configuration.datatype) {
      if (
        derivedComponent.datatype !=
        differential.data.datatype.src.value
      ) {
        if (!differential.data.datatype.derived[derivedIgId]) {
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('datatype');

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('datatype');

          if (componentDifferential) {
            componentDifferential.changed = true;
            componentDifferential.data.changed = true;
            componentDifferential.data.changeTypes.push('datatype');
          }
          differential.changed = true;
          differential.data.changed = true;
          differential.data.changeTypes.push('datatype');

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
            reason: '',
            compliance,
          };

          if (!originalProfile.summaries.datatypes) {
            originalProfile.summaries.datatypes = {};
          }

          const keyName = `${differential.data.datatype.src.value}#${derivedComponent.datatype}`;
          if (!originalProfile.summaries.datatypes[keyName]) {
            originalProfile.summaries.datatypes[keyName] = {};
          }
          if (
            !originalProfile.summaries.datatypes[keyName][derivedIgId]
          ) {
            originalProfile.summaries.datatypes[keyName][
              derivedIgId
            ] = {
              number: 0,
            };
          }

          originalProfile.summaries.datatypes[keyName][derivedIgId]
            .number++;

          if (!originalProfile.summaries.datatypes[keyName].changes) {
            originalProfile.summaries.datatypes[keyName].changes = {};
          }
          if (
            !originalProfile.summaries.datatypes[keyName].changes[
              `${path}.${differential.data.name.src.value}`
            ]
          ) {
            originalProfile.summaries.datatypes[keyName].changes[
              `${path}.${differential.data.name.src.value}`
            ] = {
              type: differential.data.type,
              path: `${path}`,
              name: differential.data.name.src.value,
              igs: {},
            };
          }
          originalProfile.summaries.datatypes[keyName].changes[
            `${path}.${differential.data.name.src.value}`
          ].igs[derivedIgId] = true;
        }
      }

      const srcDt =
        datatypesMap[srcIgId][differential.data.datatype.src.value];
      const derivedDt =
        datatypesMap[derivedIgId][derivedComponent.datatype];
      if (configuration.conformanceStatement) {
        if (!differential.data.conformanceStatements) {
          differential.data.conformanceStatements =
            this.getConformanceStatementsDiff(
              srcDt.conformanceStatements
            );
        }

        this.compareConformanceStatements(
          differential.data,
          derivedIgId,
          derivedDt.conformanceStatements
        );
      }
      if (configuration.valueset) {
        const changed = this.compareBindings(
          differential,
          srcIgId,
          derivedIgId,
          derivedDt.bindings,
          valuesetsMap,
          'datatype_component',
          originalProfile
        );
        if (changed) {
          segmentDifferential.changed = true;
          segmentDifferential.data.changed = true;
          segmentDifferential.data.changeTypes.push('valueset');

          fieldDifferential.changed = true;
          fieldDifferential.data.changed = true;
          fieldDifferential.data.changeTypes.push('valueset');

          if (componentDifferential) {
            componentDifferential.changed = true;
            componentDifferential.data.changed = true;
            componentDifferential.data.changeTypes.push('valueset');
          }
        }
        this.spreadDatatypeBindings(
          differential.children,
          differential.bindings,
          'datatype_component'
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
  },

  createProfileDiff(
    originalId,
    originalProfile,
    derivedProfile,
    configuration
  ) {
    MetricService.initializeSummaries(originalProfile);

    let reasons = derivedProfile.Reasons;
    if (reasons && reasons[0] && reasons[0].Reason) {
      if (!originalProfile.reasons) {
        originalProfile.reasons = {};
      }
      const reasonsForChange = reasons[0].Reason;
      reasonsForChange.forEach((reason) => {
        reason = reason['$'];
        let splits = reason.Location.split('.');
        splits.shift();
        splits = splits.join('.');

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
  createGroupsDiff(
    originalId,
    originalProfile,
    groups,
    configuration
  ) {
    if (groups) {
      if (originalProfile) {
        groups.forEach((group) => {
          const length = group.SegmentRef.length;
          const usage = group.SegmentRef[0]['$'].usage;
          group['$'].usage = usage;
          group.SegmentRef.splice(length - 1, 1);
          group.SegmentRef.splice(0, 1);
          let originalGroup = originalProfile.children.find(
            (p) => p.data.position === group['$'].position
          );
          // `${segmentDifferential.data.ref}.${derivedField.position}`,
          // fieldDifferential.data,
          // `${segmentDifferential.data.path}.${derivedField.position}`
          ComparisonService.compare(
            originalId,
            originalProfile,
            originalGroup,
            group['$'],
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
  createSegRefsDiff(
    originalId,
    originalProfile,
    segRefs,
    configuration
  ) {
    if (segRefs) {
      if (originalProfile) {
        segRefs.forEach((segRef) => {
          let originalSegRef = originalProfile.children.find(
            (p) => p.data.position === segRef['$'].position
          );
          ComparisonService.compare(
            originalId,
            originalProfile,
            originalSegRef,
            segRef['$'],
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
};

module.exports = CalculationService;
