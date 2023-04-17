const ProfileService = require('./profileService');
const SegmentService = require('./segmentService');
const ValuesetService = require('./valuesetService');
const DatatypeService = require('./datatypeService');

const MetricService = require('../metricService');
const ComparisonService = require('../comparisonService');

const globalConfigs = require('../../../config/global');
const _ = require('underscore');

let CalculationService = {
  calculate: function (sourceProfile, derivedIgs, configuration) {
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
    if (sourceProfile.profile) {
      const profile = sourceProfile.profile;
      // const confProfile = profile.ConformanceProfile[0];
      results.srcIg.profileId = profile['$'].Id;

      // sourceProfile.profiles.forEach(profile => {
      results.profiles.push({
        data: {
          name: profile['$'].Name,
          description: profile['$'].Description,
          title: profile['$'].Title,
          id: profile['$'].Id,
        },
        children: ProfileService.populateProfileChildren(
          profile,
          segmentsMap,
          sourceProfile.id
        ),
        segmentRefs: ProfileService.populateProfileSegments(
          profile,
          '',
          segmentsMap,
          configuration,
          sourceProfile.id,
          datatypesMap,
          valuesetsMap
        ),
        conformanceStatements: this.extractConformanceStatements(
          profile.conformanceStatements
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
        const profile = derivedIg.profile;
        const originalProfileId = profile['$'].origin;
        results.derivedIgsMap[derivedIg.id] = derivedIg.ig;
        results.derivedIgs.push({
          title: derivedIg.ig,
          id: derivedIg.id,
          profileOrigin: originalProfileId,
          derived: profile['$'].derived,
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
        child.data.path = segmentRef.data.path;
      });
    });

    return results;
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
  extractConformanceStatements(conformanceStatements) {
    let results = [];
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
        results.push(diff);
      });
    }
    return results;
  },

  createProfilesDiff(
    diff,
    derivedIg,
    configuration,
    segmentsMap,
    datatypesMap,
    valuesetsMap
  ) {
    const confProfile = derivedIg.profile;
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
        this.compareConformanceStatements(
          originalProfile,
          derivedIg.id,
          confProfile.conformanceStatements
        );
        // console.log(originalProfile.segmentRefs)
      } else {
        // Can't compare
      }
      // originalProfile.segmentRefs = originalProfile.segmentRefs.filter(
      //   s => s.changed
      // );
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
      if (derivedProfile.Segment) {
        segmentRefs.push(
          ...ProfileService.extractSegmentFromSegRefs(
            derivedProfile.Segment,
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
                sourceSegment.data.ref
              ],
              segmentsMap[derivedIgId][segmentRef.data.ref],
              configuration,
              datatypesMap,
              valuesetsMap
            );
          } else {
            // new segmentref
          }
        });
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
      }
      sourceSegment.children.sort(function (a, b) {
        return a.data.position - b.data.position;
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
              valuesetsMap
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
              valuesetsMap
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
            diff.data.changed = true;
            diff.data.changeTypes.push('conformanceStatement');
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
            },
          };
          diff.data.description.derived[derivedIgId] = {
            value: derivedConfStatement.description,
            status: 'added',
          };
          diff.data.changed = true;
          if (diff.data.changeTypes) {
            diff.data.changeTypes.push('conformanceStatement');
          }
          differential.conformanceStatements.push(diff);
        }
      });
      if (differential.conformanceStatements) {
        differential.conformanceStatements.forEach(
          (conformanceStatement) => {
            let confStatementDifferential =
              derivedConfStatements.find(
                (c) => c.id === conformanceStatement.data.id
              );
            if (!confStatementDifferential) {
              //statement deleted

              conformanceStatement.data.description.derived[
                derivedIgId
              ] = {
                value:
                  conformanceStatement.data.description.src.value,
                status: 'deleted',
              };
              diff.data.changed = true;
              diff.data.changeTypes.push('conformanceStatement');
              conformanceStatement.data.changed = true;
            }
          }
        );
      }
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
    valuesetsMap
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
    if (
      configuration.usage &&
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
    if (configuration.valueset) {
      ValuesetService.compareBindingsValidation(
        originalProfile,
        segmentDifferential,
        fieldDifferential,
        derivedField,
        srcIgId,
        derivedIgId,
        valuesetsMap
      );
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
        }
      }

      const srcDt =
        datatypesMap[srcIgId][
          fieldDifferential.data.datatype.src.value
        ];
      const derivedDt =
        datatypesMap[derivedIgId][derivedField.datatype];
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
            // TODO: Test
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
        ValuesetService.compareBindingsValidation(
          originalProfile,
          segmentDifferential,
          differential,
          derivedComponent,
          srcIgId,
          derivedIgId,
          valuesetsMap
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
    if (reasons && reasons[0]) {
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
    if (derivedProfile.Segment) {
      this.createSegRefsDiff(
        originalId,
        originalProfile,
        derivedProfile.Segment,
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
          let originalGroup = originalProfile.children.find(
            (p) => p.data.position === group['$'].position
          );

          // `${segmentDifferential.data.ref}.${derivedField.position}`,
          // fieldDifferential.data,
          // `${segmentDifferential.data.path}.${derivedField.position}`
          group['$'] = {
            id: group['$'].ID,
            name: group['$'].Name,
            usage: group['$'].Usage,
            min: group['$'].Min,
            max: group['$'].Max,
            position: group['$'].position,
            predicate: group['$'].predicate,
          };
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

          segRef['$'] = {
            label: segRef['$'].Ref,
            Ref: segRef['$'].Ref,
            usage: segRef['$'].Usage,
            min: segRef['$'].Min,
            max: segRef['$'].Max,
            position: segRef['$'].position,
            predicate: segRef['$'].predicate,
          };
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
