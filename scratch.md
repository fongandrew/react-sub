# Notes

* Context needs to know all of its sources
  * To clear
  * To register cb + id

* Context needs to be aware of mangers tracking it.
  * Tracking function
    * Clears all current managers.
    * Notifies new managers
* Managers track query IDs for each context.
  * On update, notify each context.
  * On get, if context set, track query.
  * register reset

Manager
* get - Notify current context it exists

Context
* key
* iteration