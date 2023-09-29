const ComparisonService = require('../comparisonService');
const SegmentService = require('./segmentService');
const ValuesetService = require('./valuesetService');

let ProfileService = {
  populateProfileChildren: function (profile, currentPath) {
    let res = [];
    if (profile) {
      if (profile.SegmentRef) {
        res.push(
          ...this.populateSegRefs(profile.SegmentRef, currentPath)
        );
      }
      if (profile.Group) {
        res.push(...this.populateGroups(profile.Group, currentPath));
      }
    }
    res.sort(function (a, b) {
      return a.data.position - b.data.position;
    });
    return res;
  },
  populateSegRefs: function (segRefs, currentPath) {
    let res = [];
    segRefs.forEach((segRef) => {
      res.push({
        data: {
          position: segRef['$'].position,
          path: `${currentPath ? currentPath + '.' : ''}${
            segRef['$'].position
          }`,
          ref: segRef['$'].ref,
          name: segRef['$'].ref,
          idSeg: segRef['$'].iDSeg,
          label: { src: { value: segRef['$'].label } },
          description: segRef['$'].description,
          usage: {
            src: { value: segRef['$'].usage },
          },
          predicate: {
            src: { value: segRef['$'].predicate },
          },
          cardinality: {
            src: {
              value: this.createCard(
                segRef['$'].min,
                segRef['$'].max
              ),
            },
          },
          min: {
            src: { value: segRef['$'].min },
          },
          max: {
            src: { value: segRef['$'].max },
          },
          type: 'segmentRef',
          changeTypes: [],
        },
        changed: false,
      });
    });
    return res;
  },
  populateGroups: function (groups, currentPath) {
    let res = [];
    if (groups) {
      groups = JSON.parse(JSON.stringify(groups));

      groups.forEach((group) => {
        const length = group.SegmentRef.length;
        const usage = group.SegmentRef[0]['$'].usage;
        group['$'].usage = usage;
        group.SegmentRef.splice(length - 1, 1);
        group.SegmentRef.splice(0, 1);
        const path = `${currentPath ? currentPath + '.' : ''}${
          group['$'].position
        }`;
        res.push({
          data: {
            position: group['$'].position,
            path: path,
            name: {
              src: { value: group['$'].name },
              derived: {},
            },
            usage: {
              src: { value: group['$'].usage },
            },
            predicate: {
              src: { value: group['$'].predicate },
            },
            cardinality: {
              src: {
                value: this.createCard(
                  group['$'].min,
                  group['$'].max
                ),
              },
            },
            min: {
              src: { value: group['$'].min },
            },
            max: {
              src: { value: group['$'].max },
            },
            type: 'group',
            changeTypes: [],
          },
          changed: false,
          children: this.populateProfileChildren(group, path),
        });
      });
    }
    return res;
  },
  populateProfileSegments: function (
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
  extractSegmentFromGroups: function (
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

      groups.forEach((group) => {
        if (!group['$'].usage) {
          const length = group.SegmentRef.length;
          const usage = group.SegmentRef[0]['$'].usage;
          group['$'].usage = usage;
          group.SegmentRef.splice(length - 1, 1);
          group.SegmentRef.splice(0, 1);
        }

        let path = currentPath;
        if (path == '') {
          path += group['$'].position;
        } else {
          path += `.${group['$'].position}`;
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
  extractSegmentFromSegRefs: function (
    segRefs,
    currentPath,
    segmentsMap,
    configuration,
    igId,
    datatypesMap,
    valuesetsMap
  ) {
    let res = [];
    segRefs.forEach((segRef) => {
      let path = currentPath;
      if (path == '') {
        path += segRef['$'].position;
      } else {
        path += `.${segRef['$'].position}`;
      }

      res.push({
        data: {
          position: segRef['$'].position,
          path: path,
          ref: segRef['$'].ref,
          name: {
            src: { value: segRef['$'].ref },
            derived: {},
          },
          idSeg: segRef['$'].iDSeg,
          label: {
            src: { value: segRef['$'].label },
            derived: {},
          },
          description: {
            src: { value: segRef['$'].description },
            derived: {},
          },
          changeTypes: [],
        },
        changed: false,
        children: [
          ...SegmentService.populateSrcFields(
            igId,
            segmentsMap[igId][segRef['$'].iDSeg].children,
            segmentsMap[igId][segRef['$'].iDSeg].slicings,
            configuration,
            path,
            datatypesMap,
            valuesetsMap
          ),
        ],
        conformanceStatements: [
          ...SegmentService.populateConformanceStatements(
            segmentsMap[igId][segRef['$'].iDSeg].conformanceStatements
          ),
        ],
        fieldReasons:
          segmentsMap[igId][segRef['$'].iDSeg].fieldReasons,
        bindings: [
          ...ValuesetService.populateSrcValuesets(
            igId,
            segmentsMap[igId][segRef['$'].iDSeg].bindings,
            configuration,
            valuesetsMap,
            'segment'
          ),
        ],
      });
    });
    return res;
  },
  createCard: function (min, max) {
    return `${min}..${max}`;
  },
};

module.exports = ProfileService;
