import * as React from "react";
import { observable, action, runInAction, computed } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt, DocListCastAsync } from "../../fields/Doc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import SharingManager, { User } from "./SharingManager";
import { Utils } from "../../Utils";
import * as RequestPromise from "request-promise";
import Select from 'react-select';
import "./GroupManager.scss";
import { StrCast, Cast } from "../../fields/Types";
import GroupMemberView from "./GroupMemberView";
import { setGroups } from "../../fields/util";
import { DocServer } from "../DocServer";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";

library.add(fa.faPlus, fa.faTimes, fa.faInfoCircle, fa.faCaretUp, fa.faCaretRight, fa.faCaretDown);

/**
 * Interface for options for the react-select component
 */
export interface UserOptions {
    label: string;
    value: string;
}

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable isOpen: boolean = false; // whether the GroupManager is to be displayed or not.
    @observable private users: string[] = []; // list of users populated from the database.
    @observable private selectedUsers: UserOptions[] | null = null; // list of users selected in the "Select users" dropdown.
    @observable currentGroup: Opt<Doc>; // the currently selected group.
    @observable private createGroupModalOpen: boolean = false;
    private inputRef: React.RefObject<HTMLInputElement> = React.createRef(); // the ref for the input box.
    private createGroupButtonRef: React.RefObject<HTMLButtonElement> = React.createRef(); // the ref for the group creation button
    private currentUserGroups: string[] = []; // the list of groups the current user is a member of
    @observable private buttonColour: "#979797" | "black" = "#979797";
    @observable private groupSort: "ascending" | "descending" | "none" = "none";
    private populating: boolean = false;



    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    /**
     * Populates the list of users and groups.
     */
    componentDidMount() {
        this.populateUsers();
        this.populateGroups();
    }

    /**
     * Fetches the list of users stored on the database.
     */
    populateUsers = async () => {
        if (!this.populating) {
            this.populating = true;
            runInAction(() => this.users = []);
            const userList = await RequestPromise.get(Utils.prepend("/getUsers"));
            const raw = JSON.parse(userList) as User[];
            const evaluating = raw.map(async user => {
                const userDocument = await DocServer.GetRefField(user.userDocumentId);
                if (userDocument instanceof Doc) {
                    const notificationDoc = await Cast(userDocument["sidebar-sharing"], Doc);
                    runInAction(() => {
                        if (notificationDoc instanceof Doc) {
                            this.users.push(user.email);
                        }
                    });
                }
            });
            return Promise.all(evaluating).then(() => this.populating = false);
        }
    }

    /**
     * Populates the list of groups the current user is a member of and sets this list to be used in the GetEffectiveAcl in util.ts
     */
    populateGroups = () => {
        DocListCastAsync(this.GroupManagerDoc?.data).then(groups => {
            groups?.forEach(group => {
                const members: string[] = JSON.parse(StrCast(group.members));
                if (members.includes(Doc.CurrentUserEmail)) this.currentUserGroups.push(StrCast(group.groupName));
            });
            setGroups(this.currentUserGroups);
        });
    }

    /**
     * @returns the options to be rendered in the dropdown menu to add users and create a group.
     */
    @computed get options() {
        return this.users.map(user => ({ label: user, value: user }));
    }

    /**
     * Makes the GroupManager visible.
     */
    @action
    open = () => {
        // SelectionManager.DeselectAll();
        this.isOpen = true;
        this.populateUsers();
        this.populateGroups();
    }

    /**
     * Hides the GroupManager.
    */
    @action
    close = () => {
        this.isOpen = false;
        this.currentGroup = undefined;
        // this.users = [];
        this.createGroupModalOpen = false;
        TaskCompletionBox.taskCompleted = false;
    }

    /**
     * @returns the database of groups.
     */
    get GroupManagerDoc(): Doc | undefined {
        return Doc.UserDoc().globalGroupDatabase as Doc;
    }

    /**
     * @returns a list of all group documents.
     */
    getAllGroups(): Doc[] {
        const groupDoc = this.GroupManagerDoc;
        return groupDoc ? DocListCast(groupDoc.data) : [];
    }

    /**
     * @returns a group document based on the group name.
     * @param groupName 
     */
    getGroup(groupName: string): Doc | undefined {
        const groupDoc = this.getAllGroups().find(group => group.groupName === groupName);
        return groupDoc;
    }

    /**
     * Returns an array of the list of members of a given group.
     */
    getGroupMembers(group: string | Doc): string[] {
        if (group instanceof Doc) return JSON.parse(StrCast(group.members)) as string[];
        else return JSON.parse(StrCast(this.getGroup(group)!.members)) as string[];
    }

    /**
     * @returns the members of the admin group.
     */
    get adminGroupMembers(): string[] {
        return this.getGroup("admin") ? JSON.parse(StrCast(this.getGroup("admin")!.members)) : "";
    }

    /**
     * @returns a boolean indicating whether the current user has access to edit group documents.
     * @param groupDoc 
     */
    hasEditAccess(groupDoc: Doc): boolean {
        if (!groupDoc) return false;
        const accessList: string[] = JSON.parse(StrCast(groupDoc.owners));
        return accessList.includes(Doc.CurrentUserEmail) || this.adminGroupMembers?.includes(Doc.CurrentUserEmail);
    }

    /**
     * Helper method that sets up the group document.
     * @param groupName 
     * @param memberEmails 
     */
    createGroupDoc(groupName: string, memberEmails: string[] = []) {
        const groupDoc = new Doc;
        groupDoc.groupName = groupName;
        groupDoc.owners = JSON.stringify([Doc.CurrentUserEmail]);
        groupDoc.members = JSON.stringify(memberEmails);
        if (memberEmails.includes(Doc.CurrentUserEmail)) {
            this.currentUserGroups.push(groupName);
            setGroups(this.currentUserGroups);
        }
        this.addGroup(groupDoc);
    }

    /**
     * Helper method that adds a group document to the database of group documents and @returns whether it was successfully added or not.
     * @param groupDoc 
     */
    addGroup(groupDoc: Doc): boolean {
        if (this.GroupManagerDoc) {
            Doc.AddDocToList(this.GroupManagerDoc, "data", groupDoc);
            return true;
        }
        return false;
    }

    /**
     * Deletes a group from the database of group documents and @returns whether the group was deleted or not.
     * @param group 
     */
    deleteGroup(group: Doc): boolean {
        if (group) {
            if (this.GroupManagerDoc && this.hasEditAccess(group)) {
                Doc.RemoveDocFromList(this.GroupManagerDoc, "data", group);
                SharingManager.Instance.removeGroup(group);
                const members: string[] = JSON.parse(StrCast(group.members));
                if (members.includes(Doc.CurrentUserEmail)) {
                    const index = this.currentUserGroups.findIndex(groupName => groupName === group.groupName);
                    index !== -1 && this.currentUserGroups.splice(index, 1);
                    setGroups(this.currentUserGroups);
                }
                if (group === this.currentGroup) {
                    runInAction(() => this.currentGroup = undefined);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Adds a member to a group.
     * @param groupDoc 
     * @param email 
     */
    addMemberToGroup(groupDoc: Doc, email: string) {
        if (this.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(StrCast(groupDoc.members));
            !memberList.includes(email) && memberList.push(email);
            groupDoc.members = JSON.stringify(memberList);
            SharingManager.Instance.shareWithAddedMember(groupDoc, email);
        }
    }

    /**
     * Removes a member from the group.
     * @param groupDoc 
     * @param email 
     */
    removeMemberFromGroup(groupDoc: Doc, email: string) {
        if (this.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(StrCast(groupDoc.members));
            const index = memberList.indexOf(email);
            if (index !== -1) {
                const user = memberList.splice(index, 1)[0];
                groupDoc.members = JSON.stringify(memberList);
                SharingManager.Instance.removeMember(groupDoc, email);
            }
        }
    }

    /**
     * Handles changes in the users selected in the "Select users" dropdown.
     * @param selectedOptions 
     */
    @action
    handleChange = (selectedOptions: any) => {
        this.selectedUsers = selectedOptions as UserOptions[];
    }

    /**
     * Creates the group when the enter key has been pressed (when in the input).
     * @param e 
     */
    handleKeyDown = (e: React.KeyboardEvent) => {
        e.key === "Enter" && this.createGroup();
    }

    /**
     * Handles the input of required fields in the setup of a group and resets the relevant variables.
     */
    @action
    createGroup = () => {
        if (!this.inputRef.current?.value) {
            alert("Please enter a group name");
            return;
        }
        if (this.getAllGroups().find(group => group.groupName === this.inputRef.current!.value)) { // why do I need a null check here?
            alert("Please select a unique group name");
            return;
        }
        this.createGroupDoc(this.inputRef.current.value, this.selectedUsers?.map(user => user.value));
        this.selectedUsers = null;
        this.inputRef.current.value = "";
        this.buttonColour = "#979797";

        const { left, width, top } = this.createGroupButtonRef.current!.getBoundingClientRect();
        TaskCompletionBox.popupX = left - 2 * width;
        TaskCompletionBox.popupY = top;
        TaskCompletionBox.textDisplayed = "Group created!";
        TaskCompletionBox.taskCompleted = true;
        setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2000);

    }

    /**
     * @returns the MainViewModal which allows the user to create groups.
     */
    private get groupCreationModal() {
        const contents = (
            <div className="group-create">
                <div className="group-heading" style={{ marginBottom: 0 }}>
                    <p><b>New Group</b></p>
                    <div className={"close-button"} onClick={action(() => {
                        this.createGroupModalOpen = false; TaskCompletionBox.taskCompleted = false;
                    })}>
                        <FontAwesomeIcon icon={fa.faTimes} color={"black"} size={"lg"} />
                    </div>
                </div>
                <input
                    className="group-input"
                    ref={this.inputRef}
                    onKeyDown={this.handleKeyDown}
                    autoFocus
                    type="text"
                    placeholder="Group name"
                    onChange={action(() => this.buttonColour = this.inputRef.current?.value ? "black" : "#979797")} />
                <Select
                    isMulti={true}
                    isSearchable={true}
                    options={this.options}
                    onChange={this.handleChange}
                    placeholder={"Select users"}
                    value={this.selectedUsers}
                    closeMenuOnSelect={false}
                    styles={{
                        dropdownIndicator: (base, state) => ({
                            ...base,
                            transition: '0.5s all ease',
                            transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : undefined
                        }),
                        multiValue: (base) => ({
                            ...base,
                            maxWidth: "50%",

                            '&:hover': {
                                maxWidth: "unset"
                            }
                        })
                    }}
                />
                <button
                    ref={this.createGroupButtonRef}
                    onClick={this.createGroup}
                    style={{ background: this.buttonColour }}
                    disabled={this.buttonColour === "#979797"}
                >
                    Create
                </button>
            </div>
        );

        return (
            <MainViewModal
                isDisplayed={this.createGroupModalOpen}
                interactive={true}
                contents={contents}
                dialogueBoxStyle={{ width: "90%", height: "70%" }}
                closeOnExternalClick={action(() => { this.createGroupModalOpen = false; this.selectedUsers = null; TaskCompletionBox.taskCompleted = false; })}
            />
        );
    }

    /**
     * A getter that @returns the main interface for the GroupManager.
     */
    private get groupInterface() {

        const sortGroups = (d1: Doc, d2: Doc) => {
            const g1 = StrCast(d1.groupName);
            const g2 = StrCast(d2.groupName);

            return g1 < g2 ? -1 : g1 === g2 ? 0 : 1;
        };

        let groups = this.getAllGroups();
        groups = this.groupSort === "ascending" ? groups.sort(sortGroups) : this.groupSort === "descending" ? groups.sort(sortGroups).reverse() : groups;

        return (
            <div className="group-interface">
                {this.groupCreationModal}
                {this.currentGroup ?
                    <GroupMemberView
                        group={this.currentGroup}
                        onCloseButtonClick={action(() => this.currentGroup = undefined)}
                    />
                    : null}
                <div className="group-heading">
                    <p><b>Manage Groups</b></p>
                    <button onClick={action(() => this.createGroupModalOpen = true)}>
                        <FontAwesomeIcon icon={fa.faPlus} size={"sm"} /> Create Group
                    </button>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faTimes} color={"black"} size={"lg"} />
                    </div>
                </div>
                <div className="main-container">
                    <div
                        className="sort-groups"
                        onClick={action(() => this.groupSort = this.groupSort === "ascending" ? "descending" : this.groupSort === "descending" ? "none" : "ascending")}>
                        Name {this.groupSort === "ascending" ? <FontAwesomeIcon icon={fa.faCaretUp} size={"xs"} />
                            : this.groupSort === "descending" ? <FontAwesomeIcon icon={fa.faCaretDown} size={"xs"} />
                                : <FontAwesomeIcon icon={fa.faCaretRight} size={"xs"} />
                        }
                    </div>
                    <div className="group-body">
                        {groups.map(group =>
                            <div
                                className="group-row"
                                key={StrCast(group.groupName)}
                            >
                                <div className="group-name" >{group.groupName}</div>
                                <div className="group-info" onClick={action(() => this.currentGroup = group)}>
                                    <FontAwesomeIcon icon={fa.faInfoCircle} color={"#e8e8e8"} size={"sm"} style={{ backgroundColor: "#1e89d7", borderRadius: "100%", border: "1px solid #1e89d7" }} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.groupInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxStyle={{ zIndex: 1002 }}
                overlayStyle={{ zIndex: 1001 }}
                closeOnExternalClick={this.close}
            />
        );
    }

}