const defaultManualAdmins = [
{
    id: "ADM-001",
    ADM_ID: "ADM001",
    ADM_Uname: "Sasindu",
    ADM_name: "Sasindu Ruwaneka",
    ADM_Email: "sasindu.rcm@gmail.com",
    ADM_password: "rcm@123@sasi@new",
    ADM_role: "admin"
  },
  {
    id: "ADM-002",
    ADM_ID: "ADM002",
    ADM_Uname: "ss",
    ADM_name: "Sasindu Ruwaneka",
    ADM_Email: "sasindu.rm@gmail.com",
    ADM_password: "ss",
    ADM_role: "admin"
  },
  {
    id: "EDT-001",
    ADM_ID: "EDT001",
    ADM_Uname: "Desandu",
    ADM_name: "Desandu Chithmal",
    ADM_Email: "desanduchithmal027@gmail.com",
    ADM_password: "rcm@desandu",
    ADM_role: "editor"
  },
{
    id: "EDT-002",
    ADM_ID: "EDT002",
    ADM_Uname: "Chithum",
    ADM_name: "   Chithum Kithmaka",
    ADM_Email: "chithumlk2009@gmail.com",
    ADM_password: "rcm@chithum",
    ADM_role: "editor"
  },
  {
    id: "EDT-003",
    ADM_ID: "EDT003",
    ADM_Uname: "Tharuja",
    ADM_name: "Tharuja Wehan",
    ADM_Email: "tharujawehan@gmail.com",
    ADM_password: "rcm@tharuja",
    ADM_role: "editor"
  },
  {
    id: "VIEW-001",
    ADM_ID: "VIEW001",
    ADM_Uname: "Pasan",
    ADM_name: "Pasan Vidahanapathirana",
    ADM_Email: "pasansvpathirana10@gmail.com",
    ADM_password: "rcm@pasan",
    ADM_role: "viewer"
  }
];

const storedAdmins = localStorage.getItem("rcmu_manual_admins");
window.manualAdmins = storedAdmins ? JSON.parse(storedAdmins) : defaultManualAdmins;

const migratedAdmins = window.manualAdmins.map(admin => {
  if (admin.ADM_Uname === "asindu") admin.ADM_Uname = "Sasindu";
  if (admin.ADM_name === "asindu" || admin.ADM_name === "Asindu") admin.ADM_name = "Sasindu Ruwaneka";
  return admin;
});

window.manualAdmins = migratedAdmins;
window.saveManualAdmins = function () {
  localStorage.setItem("rcmu_manual_admins", JSON.stringify(window.manualAdmins));
};

// Persist a migration fix immediately if old data was present
if (storedAdmins && JSON.stringify(migratedAdmins) !== storedAdmins) {
  window.saveManualAdmins();
}
