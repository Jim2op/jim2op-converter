package io.github.jim2op.arcforge;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.ListView;
import javafx.scene.control.PasswordField;
import javafx.scene.control.SplitPane;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TextArea;
import javafx.scene.control.TextField;
import javafx.scene.control.TextInputDialog;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** JavaFX entry point for the ArcForge Launcher. */
public final class LauncherApplication extends Application {
    private final ExecutorService background = Executors.newVirtualThreadPerTaskExecutor();
    private LauncherStore store;
    private List<ModProvider> providers = List.of();
    private ModInstallService modInstaller;
    private final MicrosoftAuthService authentication = new MicrosoftAuthService();
    private Domain.AccountProfile account;

    private final Label accountStatus = new Label("Official account: sign-in required");
    private final Label providerStatus = new Label();
    private final Label selectedInstance = new Label("No instance selected");
    private final TextArea activity = new TextArea();
    private final ListView<Domain.InstanceConfig> instanceList = new ListView<>();
    private final ListView<Domain.InstalledMod> installedMods = new ListView<>();
    private final ListView<Domain.ModProject> projectList = new ListView<>();
    private final ListView<Domain.ModFile> fileList = new ListView<>();
    private final ComboBox<ModProvider> providerChoice = new ComboBox<>();
    private final TextField searchQuery = new TextField();
    private final TextField searchVersion = new TextField("1.21.1");
    private final ComboBox<Domain.ModLoader> searchLoader = new ComboBox<>();
    private Button launchButton;
    private Button installButton;

    @Override
    public void start(Stage stage) throws Exception {
        store = new LauncherStore();
        reloadProviderConfiguration();

        activity.setEditable(false);
        activity.setWrapText(true);
        activity.setPrefRowCount(5);
        accountStatus.getStyleClass().add("account-status");
        providerStatus.getStyleClass().add("muted");

        BorderPane root = new BorderPane();
        root.setTop(buildHeader(stage));
        root.setCenter(buildTabs());
        root.setBottom(buildActivityPanel());
        BorderPane.setMargin(root.getCenter(), new Insets(0, 18, 12, 18));
        BorderPane.setMargin(root.getBottom(), new Insets(0, 18, 18, 18));

        Scene scene = new Scene(root, 1180, 780);
        scene.getStylesheets().add(getClass().getResource("/arcforge.css").toExternalForm());
        stage.setScene(scene);
        stage.setMinWidth(940);
        stage.setMinHeight(640);
        stage.setTitle("ArcForge Launcher");
        stage.show();
        refreshInstances();
        log("Launcher data directory: " + store.root());
        log("ArcForge requires an official owned Minecraft Java account for online launches.");
    }

    private HBox buildHeader(Stage stage) {
        Label title = new Label("ArcForge");
        title.getStyleClass().add("brand");
        Label subtitle = new Label("Java Edition instance and mod manager");
        subtitle.getStyleClass().add("subtitle");
        VBox identity = new VBox(2, title, subtitle);

        Button signIn = new Button("Sign in with Microsoft");
        signIn.setOnAction(event -> signIn());
        Button settings = new Button("Settings");
        settings.setOnAction(event -> showSettings());
        HBox actions = new HBox(10, accountStatus, signIn, settings);
        actions.setAlignment(Pos.CENTER_RIGHT);
        HBox header = new HBox(20, identity, spacer(), actions);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(18));
        header.getStyleClass().add("header");
        return header;
    }

    private TabPane buildTabs() {
        Tab instances = new Tab("Instances", buildInstancesView());
        instances.setClosable(false);
        Tab discover = new Tab("Discover mods", buildDiscoverView());
        discover.setClosable(false);
        Tab safety = new Tab("Online-mode policy", buildSafetyView());
        safety.setClosable(false);
        return new TabPane(instances, discover, safety);
    }

    private BorderPane buildInstancesView() {
        Button create = new Button("Create instance");
        create.setOnAction(event -> showCreateInstanceDialog());
        HBox listHeader = new HBox(10, new Label("Your instances"), spacer(), create);
        listHeader.setAlignment(Pos.CENTER_LEFT);
        VBox left = new VBox(10, listHeader, instanceList);
        left.setPadding(new Insets(16));
        VBox.setVgrow(instanceList, Priority.ALWAYS);

        Button removeMod = new Button("Remove selected mod");
        removeMod.setOnAction(event -> removeSelectedMod());
        launchButton = new Button("Launch with official account");
        launchButton.getStyleClass().add("primary");
        launchButton.setOnAction(event -> launchSelectedInstance());
        launchButton.setDisable(true);
        Label commandGuide = new Label("A launch command is supplied when creating the instance. It must target a locally installed, official game/loader profile and can use {accessToken}, {uuid}, {username}, {gameDir}, and {version}.");
        commandGuide.setWrapText(true);
        commandGuide.getStyleClass().add("muted");
        VBox right = new VBox(10, selectedInstance, new Label("Installed mods"), installedMods,
                new HBox(10, removeMod, launchButton), commandGuide);
        right.setPadding(new Insets(16));
        VBox.setVgrow(installedMods, Priority.ALWAYS);

        instanceList.getSelectionModel().selectedItemProperty().addListener((observable, oldItem, instance) -> showInstance(instance));
        SplitPane split = new SplitPane(left, right);
        split.setDividerPositions(0.37);
        BorderPane pane = new BorderPane(split);
        return pane;
    }

    private BorderPane buildDiscoverView() {
        providerChoice.getSelectionModel().selectedItemProperty().addListener((observable, oldProvider, provider) -> refreshProviderStatus());
        searchLoader.setItems(FXCollections.observableArrayList(Domain.ModLoader.values()));
        searchLoader.getSelectionModel().select(Domain.ModLoader.ANY);
        searchQuery.setPromptText("Search mods, e.g. Sodium or JEI");
        Button search = new Button("Search compatible mods");
        search.getStyleClass().add("primary");
        search.setOnAction(event -> searchMods());
        HBox filters = new HBox(10, new Label("Provider"), providerChoice, new Label("Minecraft"), searchVersion,
                new Label("Loader"), searchLoader, searchQuery, search);
        filters.setAlignment(Pos.CENTER_LEFT);
        HBox.setHgrow(searchQuery, Priority.ALWAYS);
        filters.setPadding(new Insets(16, 16, 8, 16));

        Label resultLabel = new Label("Projects");
        Label fileLabel = new Label("Compatible files");
        VBox projects = new VBox(8, resultLabel, projectList);
        projects.setPadding(new Insets(8, 16, 16, 16));
        VBox.setVgrow(projectList, Priority.ALWAYS);
        installButton = new Button("Install selected file into selected instance");
        installButton.getStyleClass().add("primary");
        installButton.setDisable(true);
        installButton.setTooltip(new Tooltip("Select an instance and a provider file first."));
        VBox files = new VBox(8, fileLabel, fileList, installButton);
        files.setPadding(new Insets(8, 16, 16, 0));
        VBox.setVgrow(fileList, Priority.ALWAYS);

        projectList.getSelectionModel().selectedItemProperty().addListener((observable, oldProject, project) -> loadFiles(project));
        fileList.getSelectionModel().selectedItemProperty().addListener((observable, oldFile, file) -> updateInstallButton());
        SplitPane split = new SplitPane(projects, files);
        split.setDividerPositions(0.52);
        BorderPane pane = new BorderPane(split);
        pane.setTop(new VBox(filters, providerStatus));
        BorderPane.setMargin(providerStatus, new Insets(0, 16, 8, 16));
        return pane;
    }

    private VBox buildSafetyView() {
        Label heading = new Label("Official online play only");
        heading.getStyleClass().add("heading");
        Label body = new Label("ArcForge never creates fake Minecraft accounts, claims game ownership, or bypasses multiplayer authentication. “Launch with official account” is available only after Microsoft sign-in, Minecraft Services token exchange, and ownership verification. A local profile may be used to organize files, but it is not presented as an online-capable account.");
        body.setWrapText(true);
        Label accountGuide = new Label("To use sign-in, create a Microsoft Entra public-client application for your launcher and enter its application (client) ID in Settings. The launcher opens Microsoft’s device-code page; it never asks for or receives your Microsoft password.");
        accountGuide.setWrapText(true);
        accountGuide.getStyleClass().add("muted");
        VBox box = new VBox(18, heading, body, accountGuide);
        box.setPadding(new Insets(32));
        return box;
    }

    private VBox buildActivityPanel() {
        Label label = new Label("Activity");
        VBox box = new VBox(6, label, activity);
        return box;
    }

    private void reloadProviderConfiguration() throws IOException {
        providers = ModProvider.createDefaultProviders(store);
        providerChoice.setItems(FXCollections.observableArrayList(providers));
        providerChoice.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(ModProvider provider) {
                return provider == null ? "" : provider.id().displayName();
            }

            @Override
            public ModProvider fromString(String value) {
                return providers.stream().filter(provider -> provider.id().displayName().equals(value)).findFirst().orElse(null);
            }
        });
        if (!providers.isEmpty()) {
            providerChoice.getSelectionModel().selectFirst();
        }
        modInstaller = new ModInstallService(store);
        refreshProviderStatus();
    }

    private void refreshProviderStatus() {
        ModProvider provider = providerChoice.getValue();
        providerStatus.setText(provider == null ? "Choose a mod provider." : provider.id().displayName() + ": " + provider.configurationHint());
    }

    private void refreshInstances() {
        runAsync(() -> {
            List<Domain.InstanceConfig> instances = store.listInstances();
            Platform.runLater(() -> instanceList.setItems(FXCollections.observableArrayList(instances)));
        }, "Unable to load instances");
    }

    private void showInstance(Domain.InstanceConfig instance) {
        if (instance == null) {
            selectedInstance.setText("No instance selected");
            installedMods.setItems(FXCollections.emptyObservableList());
            updateLaunchButton();
            updateInstallButton();
            return;
        }
        selectedInstance.setText(instance.name() + " — Minecraft " + instance.minecraftVersion() + " / " + instance.loader().displayName());
        runAsync(() -> {
            List<Domain.InstalledMod> mods = store.listInstalledMods(instance);
            Platform.runLater(() -> installedMods.setItems(FXCollections.observableArrayList(mods)));
        }, "Unable to load installed mods");
        updateLaunchButton();
        updateInstallButton();
    }

    private void showCreateInstanceDialog() {
        Dialog<Domain.InstanceConfig> dialog = new Dialog<>();
        dialog.setTitle("Create a Minecraft instance");
        dialog.setHeaderText("Point ArcForge to a legitimate, locally installed game/loader directory.");
        Button createButton = new Button("Create");
        createButton.setDefaultButton(true);
        Button cancelButton = new Button("Cancel");
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        dialog.getDialogPane().lookupButton(javafx.scene.control.ButtonType.OK).setDisable(false);

        TextField name = new TextField("My instance");
        TextField version = new TextField("1.21.1");
        ComboBox<Domain.ModLoader> loader = new ComboBox<>(FXCollections.observableArrayList(Domain.ModLoader.values()));
        loader.getSelectionModel().select(Domain.ModLoader.FABRIC);
        TextField gameDirectory = new TextField();
        gameDirectory.setPromptText("Optional; default is ArcForge-managed profile directory");
        TextArea command = new TextArea();
        command.setPromptText("Example: java -jar /path/to/official-launch-wrapper.jar --accessToken {accessToken} --uuid {uuid} --username {username} --gameDir {gameDir}");
        command.setPrefRowCount(4);
        GridPane grid = formGrid();
        grid.addRow(0, new Label("Name"), name);
        grid.addRow(1, new Label("Minecraft version"), version);
        grid.addRow(2, new Label("Loader"), loader);
        grid.addRow(3, new Label("Game directory"), gameDirectory);
        grid.addRow(4, new Label("Launch command"), command);
        dialog.getDialogPane().setContent(grid);
        dialog.setResultConverter(button -> {
            if (button != javafx.scene.control.ButtonType.OK) {
                return null;
            }
            try {
                return store.createInstance(name.getText(), version.getText(), loader.getValue(), gameDirectory.getText(), command.getText());
            } catch (IOException exception) {
                throw new IllegalStateException(exception);
            }
        });
        dialog.showAndWait().ifPresent(instance -> {
            log("Created instance: " + instance.name());
            refreshInstances();
        });
    }

    private void searchMods() {
        TextInputDialog queryDialog = new TextInputDialog(searchQuery.getText().trim());
        queryDialog.setTitle("Search mods");
        queryDialog.setHeaderText("Enter a mod search query");
        queryDialog.setContentText("Search query:");

        String query = queryDialog.showAndWait().map(String::trim).orElse(null);
        if (query == null) {
            return;
        }
        if (query.isBlank()) {
            warn("Enter a search phrase.");
            return;
        }
        searchQuery.setText(query);

        ModProvider provider = providerChoice.getValue();
        if (provider == null) {
            warn("Choose a provider.");
            return;
        }
        if (!provider.isConfigured()) {
            warn(provider.configurationHint());
            return;
        }
        projectList.setItems(FXCollections.emptyObservableList());
        fileList.setItems(FXCollections.emptyObservableList());
        log("Searching " + provider.id().displayName() + " for ‘" + query + "’.");
        runAsync(() -> {
            List<Domain.ModProject> results = provider.search(query, searchVersion.getText().trim(), searchLoader.getValue());
            Platform.runLater(() -> projectList.setItems(FXCollections.observableArrayList(results)));
            log("Found " + results.size() + " matching projects.");
        }, "Mod search failed");
    }

    private void loadFiles(Domain.ModProject project) {
        fileList.setItems(FXCollections.emptyObservableList());
        updateInstallButton();
        if (project == null) {
            return;
        }
        ModProvider provider = providers.stream().filter(candidate -> candidate.id() == project.provider()).findFirst().orElse(null);
        if (provider == null) {
            warn("The selected provider is not configured.");
            return;
        }
        log("Looking up compatible files for " + project.title() + ".");
        runAsync(() -> {
            List<Domain.ModFile> files = provider.compatibleFiles(project, searchVersion.getText().trim(), searchLoader.getValue());
            Platform.runLater(() -> fileList.setItems(FXCollections.observableArrayList(files)));
            log("Found " + files.size() + " compatible files.");
        }, "Could not load compatible files");
    }

    private void installSelectedFile() {
        Domain.InstanceConfig instance = instanceList.getSelectionModel().getSelectedItem();
        Domain.ModFile file = fileList.getSelectionModel().getSelectedItem();
        if (instance == null || file == null) {
            warn("Select an instance and a mod file first.");
            return;
        }
        if (!file.downloadable()) {
            warn("The provider did not supply a direct, authorized download URL for this file.");
            return;
        }
        log("Downloading " + file.fileName() + " into " + instance.name() + ".");
        runAsync(() -> {
            Path installed = modInstaller.install(instance, file);
            log("Installed and verified " + installed.getFileName() + ".");
            showInstance(instance);
        }, "Mod installation failed");
    }

    private void removeSelectedMod() {
        Domain.InstanceConfig instance = instanceList.getSelectionModel().getSelectedItem();
        Domain.InstalledMod mod = installedMods.getSelectionModel().getSelectedItem();
        if (instance == null || mod == null) {
            warn("Select an instance and one installed mod first.");
            return;
        }
        runAsync(() -> {
            store.removeInstalledMod(instance, mod);
            log("Removed " + mod.fileName() + " from " + instance.name() + ".");
            showInstance(instance);
        }, "Unable to remove mod");
    }

    private void signIn() {
        String clientId;
        try {
            clientId = store.loadPreferences().microsoftClientId();
        } catch (IOException exception) {
            error("Could not read launcher settings", exception);
            return;
        }
        if (clientId.isBlank()) {
            warn("Add your Microsoft Entra public application client ID in Settings before signing in.");
            return;
        }
        log("Requesting Microsoft device authorization code.");
        runAsync(() -> {
            Domain.DeviceCode code = authentication.beginDeviceCode(clientId);
            Platform.runLater(() -> showDeviceCodeDialog(clientId, code));
        }, "Could not begin Microsoft sign-in");
    }

    private void showDeviceCodeDialog(String clientId, Domain.DeviceCode code) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle("Complete Microsoft sign-in");
        alert.setHeaderText("Sign in in your browser, then return here.");
        alert.setContentText("Open: " + code.verificationUri() + "\nCode: " + code.userCode() + "\n\n" + code.message());
        alert.getButtonTypes().setAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        try {
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(code.verificationUri()));
            }
        } catch (Exception exception) {
            log("Open the verification URL manually: " + code.verificationUri());
        }
        alert.showAndWait().ifPresent(button -> {
            if (button == javafx.scene.control.ButtonType.OK) {
                log("Waiting for Microsoft sign-in confirmation.");
                runAsync(() -> {
                    Domain.AccountProfile verified = authentication.awaitOfficialMinecraftProfile(clientId, code);
                    account = verified;
                    Platform.runLater(() -> {
                        accountStatus.setText("Official account: " + verified.username() + " (verified)");
                        updateLaunchButton();
                    });
                    log("Verified Minecraft Java entitlement for " + verified.username() + ". Session remains in memory only.");
                }, "Microsoft sign-in or Minecraft ownership verification failed");
            } else {
                log("Microsoft sign-in was cancelled before token polling started.");
            }
        });
    }

    private void launchSelectedInstance() {
        Domain.InstanceConfig instance = instanceList.getSelectionModel().getSelectedItem();
        if (instance == null || account == null) {
            warn("Select an instance and complete official account sign-in first.");
            return;
        }
        runAsync(() -> new GameLaunchService(store).launchOnline(instance, account, this::log), "Official game launch failed");
    }

    private void showSettings() {
        Domain.LauncherPreferences preferences;
        try {
            preferences = store.loadPreferences();
        } catch (IOException exception) {
            error("Could not read launcher settings", exception);
            return;
        }
        Dialog<Boolean> dialog = new Dialog<>();
        dialog.setTitle("Launcher settings");
        dialog.setHeaderText("Provider credentials remain local and are never committed by ArcForge.");
        PasswordField curseForgeKey = new PasswordField();
        curseForgeKey.setText(preferences.curseForgeApiKey());
        curseForgeKey.setPromptText("Approved API key for CurseForge integration");
        TextField microsoftClientId = new TextField(preferences.microsoftClientId());
        microsoftClientId.setPromptText("Public application (client) ID, e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
        GridPane grid = formGrid();
        grid.addRow(0, new Label("CurseForge API key"), curseForgeKey);
        grid.addRow(1, new Label("Microsoft client ID"), microsoftClientId);
        dialog.getDialogPane().setContent(grid);
        dialog.getDialogPane().getButtonTypes().addAll(javafx.scene.control.ButtonType.OK, javafx.scene.control.ButtonType.CANCEL);
        dialog.setResultConverter(button -> {
            if (button != javafx.scene.control.ButtonType.OK) {
                return false;
            }
            try {
                store.savePreferences(new Domain.LauncherPreferences(curseForgeKey.getText(), microsoftClientId.getText()));
                reloadProviderConfiguration();
                return true;
            } catch (IOException exception) {
                throw new IllegalStateException(exception);
            }
        });
        dialog.showAndWait().ifPresent(saved -> {
            if (saved) {
                log("Settings saved locally. Restart the app to clear an existing in-memory account session.");
            }
        });
    }

    private void updateLaunchButton() {
        if (launchButton != null) {
            Domain.InstanceConfig instance = instanceList.getSelectionModel().getSelectedItem();
            launchButton.setDisable(instance == null || account == null || !account.readyForOnlineLaunch() || instance.commandTemplate().isBlank());
        }
    }

    private void updateInstallButton() {
        if (installButton != null) {
            Domain.ModFile file = fileList.getSelectionModel().getSelectedItem();
            installButton.setDisable(instanceList.getSelectionModel().getSelectedItem() == null || file == null || !file.downloadable());
        }
    }

    private void runAsync(ThrowingRunnable task, String failurePrefix) {
        background.submit(() -> {
            try {
                task.run();
            } catch (Exception exception) {
                Platform.runLater(() -> error(failurePrefix, exception));
            }
        });
    }

    private void log(String message) {
        Platform.runLater(() -> activity.appendText(message + System.lineSeparator()));
    }

    private void warn(String message) {
        Alert alert = new Alert(Alert.AlertType.WARNING, message, javafx.scene.control.ButtonType.OK);
        alert.setHeaderText(null);
        alert.showAndWait();
    }

    private void error(String prefix, Exception exception) {
        log(prefix + ": " + exception.getMessage());
        Alert alert = new Alert(Alert.AlertType.ERROR, prefix + ".\n\n" + exception.getMessage(), javafx.scene.control.ButtonType.OK);
        alert.setHeaderText(null);
        alert.showAndWait();
    }

    private static GridPane formGrid() {
        GridPane grid = new GridPane();
        grid.setHgap(12);
        grid.setVgap(12);
        grid.setPadding(new Insets(16));
        return grid;
    }

    private static VBox spacer() {
        VBox spacer = new VBox();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        return spacer;
    }

    @Override
    public void stop() {
        background.close();
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    public static void main(String[] args) {
        launch(args);
    }
}
