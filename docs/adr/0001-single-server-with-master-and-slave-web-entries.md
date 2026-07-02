# Single Server with Master and Slave Web Entries

The project skeleton will start as one local **KTV Room** application with a single **Server** entry and two device-facing web entries: `/master` for the **Master** role and `/slave` for the **Slave** role. This keeps the first implementation aligned with the domain model: the **Server** owns room state, while **Master** and **Slave** are connected room roles rather than separate products or independently deployed systems.

