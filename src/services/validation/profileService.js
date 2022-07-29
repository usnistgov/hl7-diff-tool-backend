const ComparisonService = require("../comparisonService");
const SegmentService = require("./segmentService");
const ValuesetService = require("./valuesetService");

let ProfileService = {
  populateProfileChildren: function(profile, segmentsMap, igId) {
    let res = [];
    if (profile) {
      if (profile.Segment) {
        res.push(...this.populateSegRefs(profile.Segment, segmentsMap, igId));
      }
      if (profile.Group) {
        res.push(...this.populateGroups(profile.Group, segmentsMap, igId));
      }
    }
    res.sort(function(a, b) {
      return a.data.position - b.data.position;
    });
    return res;
  },
  populateSegRefs: function(segRefs, segmentsMap, igId) {
    let res = [];
    segRefs.forEach(segRef => {
      const seg = segmentsMap[igId][segRef["$"].Ref];
      res.push({
        data: {
          position: segRef["$"].position,
          ref: segRef["$"].Ref,
          name: { src: { value: seg.name }, derived: {} },
          idSeg: segRef["$"].Ref,
          label: { src: { value: seg.label } },
          description: seg.description,
          usage: {
            src: { value: segRef["$"].Usage }
          },
          predicate: {
            src: { value: segRef["$"].predicate }
          },
          cardinality: {
            src: { value: this.createCard(segRef["$"].Min, segRef["$"].Max) }
          },
          min: {
            src: { value: segRef["$"].Min }
          },
          max: {
            src: { value: segRef["$"].Max }
          },
          type: "segmentRef",
          changeTypes: []

        },
        changed: false
      });
    });
    return res;
  },
  populateGroups: function(groups, segmentsMap, igId) {
    let res = [];
    if (groups) {
      groups = JSON.parse(JSON.stringify(groups));

      groups.forEach(group => {
        res.push({
          data: {
            position: group["$"].position,
            name: {
              src: { value: group["$"].Name },
              derived: {}
            },
            usage: {
              src: { value: group["$"].Usage }
            },
            predicate: {
              src: { value: group["$"].predicate }
            },
            cardinality: {
              src: { value: this.createCard(group["$"].Min, group["$"].Max) }
            },
            min: {
              src: { value: group["$"].Min }
            },
            max: {
              src: { value: group["$"].Max }
            },
            type: "group",
          changeTypes: []

          },
          changed: false,
          children: this.populateProfileChildren(group, segmentsMap, igId)
        });
      });
    }
    return res;
  },
  populateProfileSegments: function(
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
      if (profile.Segment) {
        res.push(
          ...this.extractSegmentFromSegRefs(
            profile.Segment,
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
  extractSegmentFromGroups: function(
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
  extractSegmentFromSegRefs: function(
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
          path: path,
          ref: segRef["$"].Ref,
          name: {
            src: { value: segmentsMap[igId][segRef["$"].Ref].name },
            derived: {}
          },

          label: {
            src: { value: segmentsMap[igId][segRef["$"].Ref].label },
            derived: {}
          },
          description: {
            src: { value: segmentsMap[igId][segRef["$"].Ref].description },
            derived: {}
          },
          changeTypes: []

        },
        changed: false,
        children: [
          ...SegmentService.populateSrcFields(
            igId,
            segmentsMap[igId][segRef["$"].Ref].children,
            configuration,
            path,
            datatypesMap,
            valuesetsMap
          )
        ],
        conformanceStatements: [
          ...SegmentService.populateConformanceStatements(
            segmentsMap[igId][segRef["$"].Ref].conformanceStatements
          )
        ],
        //TODO: remove comment
        // fieldReasons: segmentsMap[igId][segRef["$"].iDSeg].fieldReasons,
      });
    });
    return res;
  },
  createCard: function(min, max) {
    return `${min}..${max}`;
  }
};

module.exports = ProfileService;
