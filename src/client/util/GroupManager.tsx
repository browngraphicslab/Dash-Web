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
import { StrCast } from "../../fields/Types";
import GroupMemberView from "./GroupMemberView";
import { setGroups } from "../../fields/util";

library.add(fa.faWindowClose);

export interface UserOptions {
    label: string;
    value: string;
}

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable isOpen: boolean = false; // whether the GroupManager is to be displayed or not.
    @observable private dialogueBoxOpacity: number = 1; // opacity of the dialogue box div of the MainViewModal.
    @observable private overlayOpacity: number = 0.4; // opacity of the overlay div of the MainViewModal.
    @observable private users: string[] = []; // list of users populated from the database.
    @observable private selectedUsers: UserOptions[] | null = null; // list of users selected in the "Select users" dropdown.
    @observable currentGroup: Opt<Doc>; // the currently selected group.
    private inputRef: React.RefObject<HTMLInputElement> = React.createRef(); // the ref for the input box.
    currentUserGroups: string[] = [];

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    // sets up the list of users
    componentDidMount() {
        this.populateUsers().then(resolved => runInAction(() => this.users = resolved));

        // this.getAllGroups().forEach(group => {
        //     const members: string[] = JSON.parse(StrCast(group.members));
        //     if (members.includes(Doc.CurrentUserEmail)) this.currentUserGroups.push(group);
        // });
        DocListCastAsync(this.GroupManagerDoc?.data).then(groups => {
            groups?.forEach(group => {
                const members: string[] = JSON.parse(StrCast(group.members));
                if (members.includes(Doc.CurrentUserEmail)) this.currentUserGroups.push(StrCast(group.groupName));
            });
        })
            .finally(() => setGroups(this.currentUserGroups));

        // (this.GroupManagerDoc?.data as List<Doc>).forEach(group => {
        //     Promise.resolve(group).then(resolvedGroup => {
        //         const members: string[] = JSON.parse(StrCast(resolvedGroup.members));
        //         if (members.includes(Doc.CurrentUserEmail)) this.currentUserGroups.push(resolvedGroup);
        //     });
        // });

    }

    /**
     * Fetches the list of users stored on the database and @returns a list of the emails.
     */
    populateUsers = async () => {
        const userList: User[] = JSON.parse(await RequestPromise.get(Utils.prepend("/getUsers")));
        // const currentUserIndex = userList.findIndex(user => user.email === Doc.CurrentUserEmail);
        // currentUserIndex !== -1 && userList.splice(currentUserIndex, 1);
        return userList.map(user => user.email);
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
        SelectionManager.DeselectAll();
        this.isOpen = true;
    }

    /**
     * Hides the GroupManager.
    */
    @action
    close = () => {
        this.isOpen = false;
        this.currentGroup = undefined;
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
    // private ?
    getAllGroups(): Doc[] {
        const groupDoc = this.GroupManagerDoc;
        return groupDoc ? DocListCast(groupDoc.data) : [];
    }

    /**
     * @returns a group document based on the group name.
     * @param groupName 
     */
    // private?
    getGroup(groupName: string): Doc | undefined {
        const groupDoc = this.getAllGroups().find(group => group.groupName === groupName);
        return groupDoc;
    }

    /**
     * @returns a readonly copy of a single group document
     */
    getGroupCopy(groupName: string): Doc | undefined {
        const groupDoc = this.getGroup(groupName);
        if (groupDoc) {
            const { members, owners } = groupDoc;
            return Doc.assign(new Doc, { groupName, members: StrCast(members), owners: StrCast(owners) });
        }
        return undefined;
    }
    /**
     * @returns a readonly copy of the list of group documents
     */
    getAllGroupsCopy(): Doc[] {
        return this.getAllGroups().map(({ groupName, owners, members }) =>
            Doc.assign(new Doc, { groupName: (StrCast(groupName)), owners: (StrCast(owners)), members: (StrCast(members)) })
        );
    }

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
                // TODO look at this later
                // SharingManager.Instance.setInternalGroupSharing(group, "Not Shared");
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
    }

    /**
     * A getter that @returns the main interface for the GroupManager.
     */
    private get groupInterface() {
        return (
            <div className="group-interface">
                {/* <MainViewModal
                    contents={this.editingInterface}
                    isDisplayed={this.currentGroup ? true : false}
                    interactive={true}
                    dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                    overlayDisplayedOpacity={this.overlayOpacity}
                /> */}
                {this.currentGroup ?
                    <GroupMemberView
                        group={this.currentGroup}
                        onCloseButtonClick={action(() => this.currentGroup = undefined)}
                    />
                    : null}
                <div className="group-heading">
                    <h1>Groups</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>
                </div>
                <div className="group-body">
                    <div className="group-create">
                        <button onClick={this.createGroup}>Create group</button>
                        <input ref={this.inputRef} onKeyDown={this.handleKeyDown} type="text" placeholder="Group name" />
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
                                })
                            }}
                        />
                    </div>
                    <div className="group-content">
                        {this.getAllGroups().map(group =>
                            <div className="group-row">
                                <div className="group-name">{group.groupName}</div>
                                <button onClick={action(() => this.currentGroup = group)}>
                                    {this.hasEditAccess(group) ? "Edit" : "View"}
                                </button>
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
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
                closeOnExternalClick={this.close}
            />
        );
    }

}