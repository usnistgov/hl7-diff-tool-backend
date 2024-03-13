const fs = require('fs');
const csv = require('csvtojson');

const xml2js = require('xml2js');
const parser = new xml2js.Parser({
  // explicitChildren: true,
  preserveChildrenOrder: true,
});
const parserExplicit = new xml2js.Parser({
  explicitChildren: true,
  preserveChildrenOrder: true,
  // childkey: 'childkey',
});
const CalculationService = require('./diff/calculationService');
const ValidationCalculationService = require('./validation/calculationService');
const { Readable } = require('stream');

let DifferentialService = {
  calculateDifferential: async function (req, res) {
    const { source, configurationFile, ...files } = req.files;
    if (!req.body.configuration) {
      return res
        .status(500)
        .send({ message: 'Configuration is required' });
    }
    const configuration = JSON.parse(req.body.configuration);
    const sourceXml = source.data.toString('utf8');
    let sourceProfile;
    let derivedIgs = [];
    parser.parseString(sourceXml, function (err, result) {
      if (result && result.Document && result.Document.Section) {
        sourceProfile = {
          ig: result.Document.Metadata[0]['$'].title,
          id: result.Document['$'].id,
        };
        for (
          let index = 0;
          index < result.Document.Section[0].Section.length;
          index++
        ) {
          const section = result.Document.Section[0].Section[index];
          if (section['$'].type === 'CONFORMANCEPROFILEREGISTRY') {
            sourceProfile.profiles = section.Section;
          }

          if (section['$'].type === 'SEGMENTREGISTRY') {
            sourceProfile.segments = section.Section;
          }
          if (section['$'].type === 'DATATYPEREGISTRY') {
            sourceProfile.datatypes = section.Section;
          }
          if (section['$'].type === 'VALUESETREGISTRY') {
            sourceProfile.valuesets = section.Section;
          }
        }
      }
    });

    let summariesConfiguration = {
      fields: [
        { name: 'Administered Product' },
        { name: 'Patient Name' },
        { name: 'Family Name' },
        { name: 'User Authentication Credential', location: '3.1' },
        {
          name: 'Date/Time of Birth',
          construct: 'PID',
          location: '4.1.1.7',
        },
      ],
    };
    let derivedProfilesPromises = [];

    if (configurationFile) {
      let customConfig = await csv().fromString(
        configurationFile.data.toString('utf8')
      );
      summariesConfiguration.fields = customConfig;
    }
    for (const key in files) {
      const index = key.slice(2);
      const file = files[key];
      const fileXml = file.data.toString('utf8');
      derivedProfilesPromises[index] =
        parser.parseStringPromise(fileXml);
    }
    const derivedProfiles = await Promise.all(
      derivedProfilesPromises
    );
    for (const key in files) {
      const index = key.slice(2);
      const result = derivedProfiles[index];
      if (result && result.Document && result.Document.Section) {
        let derivedIg = {
          ig: result.Document.Metadata[0]['$'].title,
          id: result.Document['$'].id + `_${index}`,
        };
        for (
          let index = 0;
          index < result.Document.Section[0].Section.length;
          index++
        ) {
          const section = result.Document.Section[0].Section[index];

          if (section['$'].type === 'CONFORMANCEPROFILEREGISTRY') {
            derivedIg.profiles = section.Section;
          }
          if (section['$'].type === 'SEGMENTREGISTRY') {
            derivedIg.segments = section.Section;
          }
          if (section['$'].type === 'DATATYPEREGISTRY') {
            derivedIg.datatypes = section.Section;
          }
          if (section['$'].type === 'VALUESETREGISTRY') {
            derivedIg.valuesets = section.Section;
          }
        }
        derivedIgs.push(derivedIg);
      }
    }

    const results = CalculationService.calculate(
      sourceProfile,
      derivedIgs,
      configuration,
      summariesConfiguration
    );

    return res.status(200).send({ success: true, data: results });
  },
  streamJSONObject(jsonObject) {
    const stream = new Readable({
      read() {},
    });

    const jsonString = JSON.stringify(jsonObject);

    // Split the JSON string into chunks
    const size = 1024; // size of each chunk in bytes
    for (let i = 0; i < jsonString.length; i += size) {
      const chunk = jsonString.slice(i, i + size);
      stream.push(chunk);
    }

    // Push null to signal the end of the stream
    stream.push(null);

    return stream;
  },
  calculateVerificationDifferential: async function (req, res) {
    const { source, sourceVs, sourceVsBindings, sourceCt, ...files } =
      req.files;
    if (!req.body.configuration) {
      return res
        .status(500)
        .send({ message: 'Configuration is required' });
    }
    if (!req.body.srcProfile) {
      return res
        .status(500)
        .send({ message: 'Source profile is required' });
    }
    // if (!req.body.derivedProfile) {
    //   return res.status(500).send({ message: "Derived profile is required" });
    // }
    const configuration = JSON.parse(req.body.configuration);
    const srcProfileId = req.body.srcProfile;
    const srcXmlType = req.body.srcXmlType;

    const sourceXml = source.data.toString('utf8');
    let sourceProfile;
    let derivedIgs = [];
    let self = this;
    let sourceVsList;
    let sourceVsBindingsList;
    let sourceCtList;

    if (sourceVs) {
      sourceVsList = await parserExplicit.parseStringPromise(
        sourceVs.data.toString('utf8')
      );
    }
    if (sourceVsBindings) {
      sourceVsBindingsList = await parserExplicit.parseStringPromise(
        sourceVsBindings.data.toString('utf8')
      );
    }
    if (sourceCt) {
      sourceCtList = await parserExplicit.parseStringPromise(
        sourceCt.data.toString('utf8')
      );
    }

    parserExplicit.parseString(sourceXml, function (err, result) {
      if (
        result &&
        result.ConformanceProfile &&
        result.ConformanceProfile.Messages &&
        result.ConformanceProfile.Messages[0] &&
        result.ConformanceProfile.Messages[0].Message
      ) {
        sourceProfile = {
          ig: result.ConformanceProfile.MetaData[0]['$'].Name,
          id: srcProfileId,
          profile: null,
          datatypes: [],
          segments: [],
          valuesets: [],
          predicates: [],
          constraints: [],
          valuesetBindings: {
            segmentsMap: {},
            datatypesMap: {},
          },
        };
        const selectedProfile =
          result.ConformanceProfile.Messages[0].Message.find(
            (m) => m['$'].ID === srcProfileId
          );
        if (selectedProfile) {
          sourceProfile.profile = selectedProfile;
          self.populatePosition(sourceProfile.profile);
        } else {
          return res
            .status(500)
            .send({ message: 'Profile selected not found' });
        }

        if (
          result.ConformanceProfile.Segments &&
          result.ConformanceProfile.Segments[0]
        ) {
          sourceProfile.segments =
            result.ConformanceProfile.Segments[0].Segment;
          sourceProfile.segments.forEach((seg) => {
            self.populatePosition(seg);
          });
        }
        if (
          result.ConformanceProfile.Datatypes &&
          result.ConformanceProfile.Datatypes[0]
        ) {
          sourceProfile.datatypes =
            result.ConformanceProfile.Datatypes[0].Datatype;
          sourceProfile.datatypes.forEach((dt) => {
            self.populatePosition(dt);
          });
        }
        if (sourceVsList) {
          sourceProfile.valuesets = [];
          if (sourceVsList.ValueSetLibrary.ValueSetDefinitions) {
            sourceVsList.ValueSetLibrary.ValueSetDefinitions.forEach(
              (list) => {
                sourceProfile.valuesets.push(
                  ...list.ValueSetDefinition
                );
              }
            );
          }
        }
        if (sourceVsBindingsList) {
          if (
            sourceVsBindingsList.ValueSetBindingsContext &&
            sourceVsBindingsList.ValueSetBindingsContext
              .ValueSetBindings &&
            sourceVsBindingsList.ValueSetBindingsContext
              .ValueSetBindings[0].Segment
          ) {
            sourceVsBindingsList.ValueSetBindingsContext.ValueSetBindings[0].Segment[0].ByID.forEach(
              (segmentBindings) => {
                sourceProfile.valuesetBindings.segmentsMap[
                  segmentBindings['$'].ID
                ] = segmentBindings.ValueSetBinding.map(
                  (vsBinding) => {
                    return {
                      bindingStrength: vsBinding['$'].BindingStrength,
                      target: vsBinding['$'].Target,
                      bindingLocations: vsBinding.BindingLocations[0],
                      bindings: vsBinding.Bindings[0],
                    };
                  }
                );

                // sourceProfile.valuesetBindings.segmentsMap[
                //   segmentBindings['$'].ID
                // ] = {
                //   bindingStrength:
                //     segmentBindings.ValueSetBinding[0]['$']
                //       .BindingStrength,
                //   target:
                //     segmentBindings.ValueSetBinding[0]['$'].Target,
                //   bindingLocations:
                //     segmentBindings.ValueSetBinding[0]
                //       .BindingLocations[0],
                //   bindings:
                //     segmentBindings.ValueSetBinding[0].Bindings[0],
                // };
              }
            );
          }
          if (
            sourceVsBindingsList.ValueSetBindingsContext &&
            sourceVsBindingsList.ValueSetBindingsContext
              .ValueSetBindings &&
            sourceVsBindingsList.ValueSetBindingsContext
              .ValueSetBindings[0].Datatype
          ) {
            sourceVsBindingsList.ValueSetBindingsContext.ValueSetBindings[0].Datatype[0].ByID.forEach(
              (dtBindings) => {
                sourceProfile.valuesetBindings.datatypesMap[
                  dtBindings['$'].ID
                ] = dtBindings.ValueSetBinding.map((vsBinding) => {
                  return {
                    bindingStrength: vsBinding['$'].BindingStrength,
                    target: vsBinding['$'].Target,
                    bindingLocations: vsBinding.BindingLocations[0],
                    bindings: vsBinding.Bindings[0],
                  };
                });
                // sourceProfile.valuesetBindings.datatypesMap[
                //   dtBindings['$'].ID
                // ] = {
                //   bindingStrength:
                //     dtBindings.ValueSetBinding[0]['$']
                //       .BindingStrength,
                //   target: dtBindings.ValueSetBinding[0]['$'].Target,
                //   bindingLocations:
                //     dtBindings.ValueSetBinding[0].BindingLocations[0],
                //   bindings: dtBindings.ValueSetBinding[0].Bindings[0],
                // };
              }
            );
          }
        }
        if (sourceCtList) {
          sourceProfile.predicates = [];
          sourceProfile.constraints = [];

          if (sourceCtList.ConformanceContext.Predicates) {
            sourceProfile.predicates =
              sourceCtList.ConformanceContext.Predicates[0];
            // sourceVsList.ConformanceContext.Predicates.forEach(list => {
            //   sourceProfile.predicates.push(...list.ValueSetDefinition);
            // });
          }
          if (sourceCtList.ConformanceContext.Constraints) {
            sourceProfile.constraints =
              sourceCtList.ConformanceContext.Constraints[0];
          }
          self.populatePredicates(sourceProfile);
          self.populateConformanceStatements(sourceProfile);
        }
      }
    });
    let vsPromises = [];
    let vsBindingsPromises = [];
    let ctPromises = [];
    let derivedProfilesPromises = [];

    for (const key in files) {
      if (key.startsWith('vs')) {
        const index = key.slice(2);
        vsPromises[index] = parserExplicit.parseStringPromise(
          files[key].data.toString('utf8')
        );
      }
      if (key.startsWith('vsBindings')) {
        const index = key.slice(10);
        vsBindingsPromises[index] = parserExplicit.parseStringPromise(
          files[key].data.toString('utf8')
        );
      }
      if (key.startsWith('ct')) {
        const index = key.slice(2);
        ctPromises[index] = parserExplicit.parseStringPromise(
          files[key].data.toString('utf8')
        );
      }
      if (key.startsWith('ig')) {
        const index = key.slice(2);
        const file = files[key];
        const fileXml = file.data.toString('utf8');
        derivedProfilesPromises[index] =
          parserExplicit.parseStringPromise(fileXml);
      }
    }
    const vsFiles = await Promise.all(vsPromises);
    const vsBindingsFiles = await Promise.all(vsBindingsPromises);
    const ctFiles = await Promise.all(ctPromises);
    const derivedProfiles = await Promise.all(
      derivedProfilesPromises
    );

    for (const key in files) {
      if (key.startsWith('ig')) {
        const index = key.slice(2);
        const derivedProfileId = req.body[`derivedProfile${index}`];
        const derivedXmlType = req.body[`derivedXmlType${index}`];
        const result = derivedProfiles[index];
        if (
          result &&
          result.ConformanceProfile &&
          result.ConformanceProfile.Messages &&
          result.ConformanceProfile.Messages[0] &&
          result.ConformanceProfile.Messages[0].Message
        ) {
          let derivedIg = {
            ig: result.ConformanceProfile.MetaData[0]['$'].Name,
            id: derivedProfileId + `_${index}`,
            profile: null,
            datatypes: [],
            segments: [],
            valuesets: [],
            predicates: [],
            constraints: [],
            valuesetBindings: {
              segmentsMap: {},
              datatypesMap: {},
            },
          };
          const selectedProfile =
            result.ConformanceProfile.Messages[0].Message.find(
              (m) => m['$'].ID === derivedProfileId
            );
          if (selectedProfile) {
            derivedIg.profile = selectedProfile;
            self.populatePosition(derivedIg.profile);
          } else {
            return res
              .status(500)
              .send({ message: 'Profile selected not found' });
          }
          if (
            result.ConformanceProfile.Segments &&
            result.ConformanceProfile.Segments[0]
          ) {
            derivedIg.segments =
              result.ConformanceProfile.Segments[0].Segment;
            derivedIg.segments.forEach((seg) => {
              self.populatePosition(seg);
            });
          }
          if (
            result.ConformanceProfile.Datatypes &&
            result.ConformanceProfile.Datatypes[0]
          ) {
            derivedIg.datatypes =
              result.ConformanceProfile.Datatypes[0].Datatype;
            derivedIg.datatypes.forEach((dt) => {
              self.populatePosition(dt);
            });
          }
          if (vsFiles[index]) {
            derivedIg.valuesets = [];
            if (
              vsFiles[index].ValueSetLibrary &&
              vsFiles[index].ValueSetLibrary.ValueSetDefinitions
            ) {
              vsFiles[
                index
              ].ValueSetLibrary.ValueSetDefinitions.forEach(
                (list) => {
                  derivedIg.valuesets.push(
                    ...list.ValueSetDefinition
                  );
                }
              );
            }
          }
          if (vsBindingsFiles[index]) {
            if (
              vsBindingsFiles[index].ValueSetBindingsContext &&
              vsBindingsFiles[index].ValueSetBindingsContext
                .ValueSetBindings &&
              vsBindingsFiles[index].ValueSetBindingsContext
                .ValueSetBindings[0].Segment
            ) {
              vsBindingsFiles[
                index
              ].ValueSetBindingsContext.ValueSetBindings[0].Segment[0].ByID.forEach(
                (segmentBindings) => {
                  derivedIg.valuesetBindings.segmentsMap[
                    segmentBindings['$'].ID
                  ] = segmentBindings.ValueSetBinding.map(
                    (vsBinding) => {
                      return {
                        bindingStrength:
                          vsBinding['$'].BindingStrength,
                        target: vsBinding['$'].Target,
                        bindingLocations:
                          vsBinding.BindingLocations[0],
                        bindings: vsBinding.Bindings[0],
                      };
                    }
                  );

                  // derivedIg.valuesetBindings.segmentsMap[
                  //   segmentBindings['$'].ID
                  // ] = {
                  //   bindingStrength:
                  //     segmentBindings.ValueSetBinding[0]['$']
                  //       .BindingStrength,
                  //   target:
                  //     segmentBindings.ValueSetBinding[0]['$'].Target,
                  //   bindingLocations:
                  //     segmentBindings.ValueSetBinding[0]
                  //       .BindingLocations[0],
                  //   bindings:
                  //     segmentBindings.ValueSetBinding[0].Bindings[0],
                  // };
                }
              );
            }
            if (
              vsBindingsFiles[index].ValueSetBindingsContext &&
              vsBindingsFiles[index].ValueSetBindingsContext
                .ValueSetBindings &&
              vsBindingsFiles[index].ValueSetBindingsContext
                .ValueSetBindings[0].Datatype
            ) {
              vsBindingsFiles[
                index
              ].ValueSetBindingsContext.ValueSetBindings[0].Datatype[0].ByID.forEach(
                (dtBindings) => {
                  derivedIg.valuesetBindings.datatypesMap[
                    dtBindings['$'].ID
                  ] = dtBindings.ValueSetBinding.map((vsBinding) => {
                    return {
                      bindingStrength: vsBinding['$'].BindingStrength,
                      target: vsBinding['$'].Target,
                      bindingLocations: vsBinding.BindingLocations[0],
                      bindings: vsBinding.Bindings[0],
                    };
                  });

                  // derivedIg.valuesetBindings.datatypesMap[
                  //   dtBindings['$'].ID
                  // ] = {
                  //   bindingStrength:
                  //     dtBindings.ValueSetBinding[0]['$']
                  //       .BindingStrength,
                  //   target: dtBindings.ValueSetBinding[0]['$'].Target,
                  //   bindingLocations:
                  //     dtBindings.ValueSetBinding[0]
                  //       .BindingLocations[0],
                  //   bindings:
                  //     dtBindings.ValueSetBinding[0].Bindings[0],
                  // };
                }
              );
            }
          }
          if (ctFiles[index]) {
            derivedIg.predicates = [];
            derivedIg.constraints = [];
            if (ctFiles[index].ConformanceContext.Predicates) {
              derivedIg.predicates =
                ctFiles[index].ConformanceContext.Predicates[0];
            }
            if (ctFiles[index].ConformanceContext.Constraints) {
              derivedIg.constraints =
                ctFiles[index].ConformanceContext.Constraints[0];
            }
            self.populatePredicates(derivedIg);
            self.populateConformanceStatements(derivedIg);
          }

          derivedIgs.push(derivedIg);
        }
      }
    }
    const data = ValidationCalculationService.calculate(
      sourceProfile,
      derivedIgs,
      configuration
    );
    return res.status(200).send({ success: true, data: data });
  },
  populateConformanceStatements: function (profile) {
    if (profile.constraints) {
      if (profile.constraints.Message) {
        let constraints = profile.constraints.Message[0].ByID;
        if (constraints) {
          constraints.forEach((constraint) => {
            const profileId = constraint['$'].ID;

            if (profile.id === profileId) {
              profile.profile.conformanceStatements =
                constraint.Constraint.map((c) => {
                  return {
                    id: c['$'].ID,
                    description: c.Description[0],
                  };
                });
            }
          });
        }
      }
      if (profile.constraints.Group) {
        let constraints = profile.constraints.Group[0].ByID;
        if (constraints) {
          constraints.forEach((constraint) => {
            const id = constraint['$'].ID;

            if (id.startsWith(profile.id)) {
              profile.profile.conformanceStatements.push(
                ...constraint.Constraint.map((c) => {
                  return {
                    id: c['$'].ID,
                    description: c.Description[0],
                  };
                })
              );
            }
          });
        }
      }
      if (profile.constraints.Segment) {
        let constraints = profile.constraints.Segment[0].ByID;
        if (constraints) {
          constraints.forEach((constraint) => {
            const segmentId = constraint['$'].ID;
            let segment = profile.segments.find(
              (seg) => seg['$'].ID === segmentId
            );
            if (segment) {
              segment.conformanceStatements =
                constraint.Constraint.map((c) => {
                  return {
                    id: c['$'].ID,
                    description: c.Description[0],
                  };
                });
            }
          });
        }
      }
      if (profile.constraints.Datatype) {
        let constraints = profile.constraints.Datatype[0].ByID;
        if (constraints) {
          constraints.forEach((constraint) => {
            const datatypeId = constraint['$'].ID;
            let datatype = profile.datatypes.find(
              (dt) => dt['$'].ID === datatypeId
            );
            if (datatype) {
              datatype.conformanceStatements =
                constraint.Constraint.map((c) => {
                  return {
                    id: c['$'].ID,
                    description: c.Description[0],
                  };
                });
            }
          });
        }
      }
    }
  },
  populatePredicates: function (profile) {
    if (profile.predicates) {
      if (profile.predicates.Segment) {
        let predicates = profile.predicates.Segment[0].ByID;
        if (predicates) {
          predicates.forEach((predicate) => {
            let segment = profile.segments.find(
              (seg) => seg['$'].ID === predicate['$'].ID
            );
            if (segment) {
              predicate.Predicate.forEach((pre) => {
                let position = pre['$'].Target.split('[')[0];
                let field = segment.Field.find(
                  (f) => f['$'].position === position
                );
                if (field) {
                  field['$'].predicate = pre.Description[0];
                  //TODO: update usage to C(R/X)
                }
              });
            }
          });
        }
      }
      if (profile.predicates.Datatype) {
        let predicates = profile.predicates.Datatype[0].ByID;
        if (predicates) {
          predicates.forEach((predicate) => {
            let datatype = profile.datatypes.find(
              (dt) => dt['$'].ID === predicate['$'].ID
            );
            if (datatype) {
              predicate.Predicate.forEach((pre) => {
                let position = pre['$'].Target.split('[')[0];
                let component = datatype.Component.find(
                  (c) => c['$'].position === position
                );
                if (component) {
                  component['$'].predicate = pre.Description[0];
                  //TODO: update usage to C(R/X)
                }
              });
            }
          });
        }
      }
      //TODO: add for message
      if (
        profile.predicates.Message &&
        profile.predicates.Message[0] &&
        profile.predicates.Message[0].ByID
      ) {
        let predicates = profile.predicates.Message[0].ByID.find(
          (m) => m['$'].ID === profile.id
        );
        if (predicates) {
          predicates.Predicate.forEach((predicate) => {
            this.populateMessagePredicate(
              predicate,
              profile.profile,
              null
            );

            // let datatype = profile.datatypes.find(
            //   dt => dt["$"].ID === predicate["$"].ID
            // );
            // if (datatype) {
            //   predicate.Predicate.forEach(pre => {
            //     let position = pre["$"].Target.split("[")[0];
            //     let component = datatype.Component.find(
            //       c => c["$"].position === position
            //     );
            //     if (component) {
            //       component["$"].predicate = pre.Description[0];
            //       //TODO: update usage to C(R/X)
            //     }
            //   });
            // }
          });
        }
      }
    }
  },
  populateMessagePredicate: function (predicate, profile, path) {
    if (!path) {
      path = [];
      let target = predicate['$'].Target;

      if (target) {
        path = target.split('.');
        path = path.map((p) => p.split('[')[0]);
      }
    }

    if (path.length === 1) {
      let segment = profile.Segment.find(
        (s) => s['$'].position === path[0]
      );
      if (segment) {
        segment['$'].predicate = predicate.Description[0];
      } else {
        let group = profile.Group.find(
          (g) => g['$'].position === path[0]
        );
        if (group) {
          group['$'].predicate = predicate.Description[0];
        }
      }
    } else if (path.length > 1) {
      let group = profile.Group.find(
        (g) => g['$'].position === path[0]
      );
      if (group) {
        path.splice(0, 1);
        this.populateMessagePredicate(predicate, group, path);
      } else {
        console.log('Field predicate', path);
      }
    }
  },
  populatePosition: function (profile) {
    let position = 1;

    if (profile['$$']) {
      profile['$$'].forEach((element) => {
        if (element['#name'] === 'Segment') {
          let seg = profile.Segment.find((s) => {
            return s['$'].Ref === element['$'].Ref;
          });
          seg['$'].position = position.toString();
          position++;
        }
        if (element['#name'] === 'Group') {
          let grp = profile.Group.find((g) => {
            return g['$'].ID === element['$'].ID;
          });
          grp['$'].position = position.toString();
          this.populatePosition(grp);
          position++;
        }
        if (element['#name'] === 'Field') {
          let seg = profile.Field.find((s) => {
            return s['$'].Name === element['$'].Name;
          });
          seg['$'].position = position.toString();
          position++;
        }
        if (element['#name'] === 'Component') {
          let seg = profile.Component.find((s) => {
            return s['$'].Name === element['$'].Name;
          });
          seg['$'].position = position.toString();
          position++;
        }
      });
    }
  },
};

module.exports = DifferentialService;
