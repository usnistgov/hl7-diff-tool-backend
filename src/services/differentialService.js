const fs = require("fs");
const xml2js = require("xml2js");
const parser = new xml2js.Parser({
  explicitChildren: true,
  preserveChildrenOrder: true
});
const CalculationService = require("./diff/calculationService");
const ValidationCalculationService = require("./validation/calculationService");

let DifferentialService = {
  calculateDifferential: function(req, res) {
    const { source, ...files } = req.files;
    if (!req.body.configuration) {
      return res.status(500).send({ message: "Configuration is required" });
    }
    const configuration = JSON.parse(req.body.configuration);
    const sourceXml = source.data.toString("utf8");
    let sourceProfile;
    let derivedIgs = [];
    parser.parseString(sourceXml, function(err, result) {
      if (result && result.Document && result.Document.Section) {
        sourceProfile = {
          ig: result.Document.Metadata[0]["$"].title,
          id: result.Document["$"].id
        };
        for (
          let index = 0;
          index < result.Document.Section[0].Section.length;
          index++
        ) {
          const section = result.Document.Section[0].Section[index];
          if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
            sourceProfile.profiles = section.Section;
          }

          if (section["$"].type === "SEGMENTREGISTRY") {
            sourceProfile.segments = section.Section;
          }
          if (section["$"].type === "DATATYPEREGISTRY") {
            sourceProfile.datatypes = section.Section;
          }
          if (section["$"].type === "VALUESETREGISTRY") {
            sourceProfile.valuesets = section.Section;
          }
        }
      }
    });

    for (const key in files) {
      if (files.hasOwnProperty(key)) {
        const file = files[key];
        const fileXml = file.data.toString("utf8");

        parser.parseString(fileXml, function(err, result) {
          if (result && result.Document && result.Document.Section) {
            let derivedIg = {
              ig: result.Document.Metadata[0]["$"].title,
              id: result.Document["$"].id
            };
            for (
              let index = 0;
              index < result.Document.Section[0].Section.length;
              index++
            ) {
              const section = result.Document.Section[0].Section[index];

              if (section["$"].type === "CONFORMANCEPROFILEREGISTRY") {
                derivedIg.profiles = section.Section;
              }
              if (section["$"].type === "SEGMENTREGISTRY") {
                derivedIg.segments = section.Section;
              }
              if (section["$"].type === "DATATYPEREGISTRY") {
                derivedIg.datatypes = section.Section;
              }
              if (section["$"].type === "VALUESETREGISTRY") {
                derivedIg.valuesets = section.Section;
              }
            }
            derivedIgs.push(derivedIg);
          }
        });
      }
    }
    const result = CalculationService.calculate(
      sourceProfile,
      derivedIgs,
      configuration
    );
    return res.status(200).send({ success: true, data: result });
  },
  calculateVerificationDifferential: async function(req, res) {
    const { source, sourceVs, sourceCt, ...files } = req.files;
    if (!req.body.configuration) {
      return res.status(500).send({ message: "Configuration is required" });
    }
    if (!req.body.srcProfile) {
      return res.status(500).send({ message: "Source profile is required" });
    }
    // if (!req.body.derivedProfile) {
    //   return res.status(500).send({ message: "Derived profile is required" });
    // }
    const configuration = JSON.parse(req.body.configuration);
    const srcProfileId = req.body.srcProfile;

    const sourceXml = source.data.toString("utf8");
    let sourceProfile;
    let derivedIgs = [];
    let self = this;
    let sourceVsList;
    let sourceCtList;

    if (sourceVs) {
      sourceVsList = await parser.parseStringPromise(
        sourceVs.data.toString("utf8")
      );
    }
    if (sourceCt) {
      sourceCtList = await parser.parseStringPromise(
        sourceCt.data.toString("utf8")
      );
    }

    parser.parseString(sourceXml, function(err, result) {
      if (
        result &&
        result.ConformanceProfile &&
        result.ConformanceProfile.Messages &&
        result.ConformanceProfile.Messages[0] &&
        result.ConformanceProfile.Messages[0].Message
      ) {
        sourceProfile = {
          ig: result.ConformanceProfile.MetaData[0]["$"].Name,
          id: srcProfileId
        };
        const selectedProfile = result.ConformanceProfile.Messages[0].Message.find(
          m => m["$"].ID === srcProfileId
        );
        if (selectedProfile) {
          sourceProfile.profile = selectedProfile;
          self.populatePosition(sourceProfile.profile);
        } else {
          return res
            .status(500)
            .send({ message: "Profile selected not found" });
        }

        if (
          result.ConformanceProfile.Segments &&
          result.ConformanceProfile.Segments[0]
        ) {
          sourceProfile.segments =
            result.ConformanceProfile.Segments[0].Segment;
          sourceProfile.segments.forEach(seg => {
            self.populatePosition(seg);
          });
        }
        if (
          result.ConformanceProfile.Datatypes &&
          result.ConformanceProfile.Datatypes[0]
        ) {
          sourceProfile.datatypes =
            result.ConformanceProfile.Datatypes[0].Datatype;
          sourceProfile.datatypes.forEach(dt => {
            self.populatePosition(dt);
          });
        }
        if (sourceVsList) {
          sourceProfile.valuesets = [];
          if (sourceVsList.ValueSetLibrary.ValueSetDefinitions) {
            sourceVsList.ValueSetLibrary.ValueSetDefinitions.forEach(list => {
              sourceProfile.valuesets.push(...list.ValueSetDefinition);
            });
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
    let ctPromises = [];
    let derivedProfilesPromises = [];

    for (const key in files) {
      if (key.startsWith("vs")) {
        const index = key.slice(2);
        vsPromises[index] = parser.parseStringPromise(
          files[key].data.toString("utf8")
        );
      }
      if (key.startsWith("ct")) {
        const index = key.slice(2);
        ctPromises[index] = parser.parseStringPromise(
          files[key].data.toString("utf8")
        );
      }
      if (key.startsWith("ig")) {
        const index = key.slice(2);
        const file = files[key];
        const fileXml = file.data.toString("utf8");
        derivedProfilesPromises[index] = parser.parseStringPromise(fileXml);
      }
    }
    const vsFiles = await Promise.all(vsPromises);
    const ctFiles = await Promise.all(ctPromises);
    const derivedProfiles = await Promise.all(derivedProfilesPromises);

    for (const key in files) {
      if (key.startsWith("ig")) {
        const index = key.slice(2);
        const derivedProfileId = req.body[`derivedProfile${index}`];
        const result = derivedProfiles[index];
        if (
          result &&
          result.ConformanceProfile &&
          result.ConformanceProfile.Messages &&
          result.ConformanceProfile.Messages[0] &&
          result.ConformanceProfile.Messages[0].Message
        ) {
          let derivedIg = {
            ig: result.ConformanceProfile.MetaData[0]["$"].Name,
            id: derivedProfileId + `_${index}`
          };
          const selectedProfile = result.ConformanceProfile.Messages[0].Message.find(
            m => m["$"].ID === derivedProfileId
          );
          if (selectedProfile) {
            derivedIg.profile = selectedProfile;
            self.populatePosition(derivedIg.profile);
          } else {
            return res
              .status(500)
              .send({ message: "Profile selected not found" });
          }
          if (
            result.ConformanceProfile.Segments &&
            result.ConformanceProfile.Segments[0]
          ) {
            derivedIg.segments = result.ConformanceProfile.Segments[0].Segment;
            derivedIg.segments.forEach(seg => {
              self.populatePosition(seg);
            });
          }
          if (
            result.ConformanceProfile.Datatypes &&
            result.ConformanceProfile.Datatypes[0]
          ) {
            derivedIg.datatypes =
              result.ConformanceProfile.Datatypes[0].Datatype;
            derivedIg.datatypes.forEach(dt => {
              self.populatePosition(dt);
            });
          }
          if (vsFiles[index]) {
            derivedIg.valuesets = [];
            if (
              vsFiles[index].ValueSetLibrary &&
              vsFiles[index].ValueSetLibrary.ValueSetDefinitions
            ) {
              vsFiles[index].ValueSetLibrary.ValueSetDefinitions.forEach(
                list => {
                  derivedIg.valuesets.push(...list.ValueSetDefinition);
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
  populateConformanceStatements: function(profile) {
    if (profile.constraints) {
      if (profile.constraints.Message) {
        let constraints = profile.constraints.Message[0].ByID;

        constraints.forEach(constraint => {
          const profileId = constraint["$"].ID;

          if (profile.id === profileId) {
            profile.profile.conformanceStatements = constraint.Constraint.map(
              c => {
                return { id: c["$"].ID, description: c.Description[0] };
              }
            );
          }
        });
      }
      if (profile.constraints.Group) {
        let constraints = profile.constraints.Group[0].ByID;

        constraints.forEach(constraint => {
          const id = constraint["$"].ID;

          if (id.startsWith(profile.id)) {
            profile.profile.conformanceStatements.push(
              ...constraint.Constraint.map(c => {
                return { id: c["$"].ID, description: c.Description[0] };
              })
            );
          }
        });
      }
      if (profile.constraints.Segment) {
        let constraints = profile.constraints.Segment[0].ByID;
        constraints.forEach(constraint => {
          const segmentId = constraint["$"].ID;
          let segment = profile.segments.find(seg => seg["$"].ID === segmentId);
          if (segment) {
            segment.conformanceStatements = constraint.Constraint.map(c => {
              return { id: c["$"].ID, description: c.Description[0] };
            });
          }
        });
      }
      if (profile.constraints.Datatype) {
        let constraints = profile.constraints.Datatype[0].ByID;
        constraints.forEach(constraint => {
          const datatypeId = constraint["$"].ID;
          let datatype = profile.datatypes.find(
            dt => dt["$"].ID === datatypeId
          );
          if (datatype) {
            datatype.conformanceStatements = constraint.Constraint.map(c => {
              return { id: c["$"].ID, description: c.Description[0] };
            });
          }
        });
      }
    }
  },
  populatePredicates: function(profile) {
    if (profile.predicates) {
      if (profile.predicates.Segment) {
        let predicates = profile.predicates.Segment[0].ByID;
        if (predicates) {
          predicates.forEach(predicate => {
            let segment = profile.segments.find(
              seg => seg["$"].ID === predicate["$"].ID
            );
            if (segment) {
              predicate.Predicate.forEach(pre => {
                let position = pre["$"].Target.split("[")[0];
                let field = segment.Field.find(
                  f => f["$"].position === position
                );
                if (field) {
                  field["$"].predicate = pre.Description[0];
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
          predicates.forEach(predicate => {
            let datatype = profile.datatypes.find(
              dt => dt["$"].ID === predicate["$"].ID
            );
            if (datatype) {
              predicate.Predicate.forEach(pre => {
                let position = pre["$"].Target.split("[")[0];
                let component = datatype.Component.find(
                  c => c["$"].position === position
                );
                if (component) {
                  component["$"].predicate = pre.Description[0];
                  //TODO: update usage to C(R/X)
                }
              });
            }
          });
        }
      }
      //TODO: add for message
      if (profile.predicates.Message) {
        let predicates = profile.predicates.Message[0].ByID.find(
          m => m["$"].ID === profile.id
        );
        if (predicates) {
          predicates.Predicate.forEach(predicate => {
            this.populateMessagePredicate(predicate, profile.profile, null);

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
  populateMessagePredicate: function(predicate, profile, path) {
    if (!path) {
      path = [];
      let target = predicate["$"].Target;

      if (target) {
        path = target.split(".");
        path = path.map(p => p.split("[")[0]);
      }
    }

    if (path.length === 1) {
      let segment = profile.Segment.find(s => s["$"].position === path[0]);
      if (segment) {
        segment["$"].predicate = predicate.Description[0];
      } else {
        let group = profile.Group.find(g => g["$"].position === path[0]);
        if (group) {
          group["$"].predicate = predicate.Description[0];
        }
      }
    } else if (path.length > 1) {
      let group = profile.Group.find(g => g["$"].position === path[0]);
      if (group) {
        path.splice(0, 1);
        this.populateMessagePredicate(predicate, group, path);
      } else {
        console.log("Field predicate", path);
      }
    }

    // console.log(predicate)
  },
  populatePosition: function(profile) {
    let position = 1;
    if (profile["$$"]) {
      profile["$$"].forEach(element => {
        if (element["#name"] === "Segment") {
          let seg = profile.Segment.find(s => {
            return s["$"].Ref === element["$"].Ref;
          });
          seg["$"].position = position.toString();
          position++;
        }
        if (element["#name"] === "Group") {
          let grp = profile.Group.find(g => {
            return g["$"].ID === element["$"].ID;
          });
          grp["$"].position = position.toString();
          this.populatePosition(grp);
          position++;
        }
        if (element["#name"] === "Field") {
          let seg = profile.Field.find(s => {
            return s["$"].Name === element["$"].Name;
          });
          seg["$"].position = position.toString();
          position++;
        }
        if (element["#name"] === "Component") {
          let seg = profile.Component.find(s => {
            return s["$"].Name === element["$"].Name;
          });
          seg["$"].position = position.toString();
          position++;
        }
      });
    }
  }
};

module.exports = DifferentialService;
